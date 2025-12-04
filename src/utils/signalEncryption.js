/**
 * @file utils/signalEncryption.js
 * @description Signal‑Protocol E2EE helpers (backend only)
 *              – key generation
 *              – PreKeyBundle retrieval
 *              – SessionRecord storage
 *              – NO plaintext handling
 */

const {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  PreKeyBundle,
  keyhelper,
} = require('@newfadel/libsignal-node');
const prisma = require('../utils/prisma');
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/* 1. Custom Signal Store backed by Prisma (only public data)         */
/* ------------------------------------------------------------------ */
class PrismaSignalStore {
  constructor(userId) {
    this.userId = userId;
  }

  /* ---------- Identity ---------- */
  async getIdentityKeyPair() {
    const dev = await prisma.device.findFirst({
      where: { UserID: this.userId },
      orderBy: { DeviceID: 'desc' },
    });
    if (!dev) throw new Error('Device not found');
    return {
      pubKey: Buffer.from(dev.IdentityKey),
      // private key NEVER stored on server
    };
  }

  async getLocalRegistrationId() {
    const dev = await prisma.device.findFirst({ where: { UserID: this.userId } });
    return dev.RegistrationId;
  }

  /* ---------- PreKeys ---------- */
  async loadPreKey(keyId) {
    const pk = await prisma.preKey.findFirst({
      where: { Device: { UserID: this.userId }, KeyId: keyId },
    });
    return pk ? Buffer.from(pk.PublicKey) : undefined;
  }

  async storePreKey(keyId, keyPair) {
    // not needed – client uploads prekeys
  }

  async removePreKey(keyId) {
    await prisma.preKey.updateMany({
      where: { Device: { UserID: this.userId }, KeyId: keyId },
      data: { Used: true },
    });
  }

  /* ---------- Signed PreKey ---------- */
  async loadSignedPreKey(keyId) {
    const spk = await prisma.signedPreKey.findFirst({
      where: { Device: { UserID: this.userId } },
    });
    return spk && spk.KeyId === keyId
      ? { pubKey: Buffer.from(spk.PublicKey), signature: Buffer.from(spk.Signature) }
      : undefined;
  }

  async storeSignedPreKey(keyId, keyPair, signature) {
    // client uploads signed prekey
  }

  /* ---------- Session ---------- */
  async loadSession(addressStr) {
    const addr = SignalProtocolAddress.fromString(addressStr);
    const rec = await prisma.sessionRecord.findFirst({
      where: {
        OwnerID: this.userId,
        RemoteUserID: parseInt(addr.getName()),
        RemoteDeviceID: addr.getDeviceId(),
      },
    });
    return rec ? Buffer.from(rec.Record) : null;
  }

  async storeSession(addressStr, recordBuf) {
    const addr = SignalProtocolAddress.fromString(addressStr);
    await prisma.sessionRecord.upsert({
      where: {
        OwnerID_RemoteUserID_RemoteDeviceID: {
          OwnerID: this.userId,
          RemoteUserID: parseInt(addr.getName()),
          RemoteDeviceID: addr.getDeviceId(),
        },
      },
      update: { Record: recordBuf, UpdatedAt: new Date() },
      create: {
        OwnerID: this.userId,
        RemoteUserID: parseInt(addr.getName()),
        RemoteDeviceID: addr.getDeviceId(),
        Record: recordBuf,
      },
    });
  }

  /* ---------- Identity trust (Safety Numbers) ---------- */
  async isTrustedIdentity(address, identityKey) {
    // Implement QR‑code / safety‑number verification in UI
    return true; // default trust – replace with real logic
  }
}

/* ------------------------------------------------------------------ */
/* 2. Generate keys for a new device (called once per login)          */
/* ------------------------------------------------------------------ */
async function generateDeviceKeys(userId) {
  const identityKeyPair = await keyhelper.generateIdentityKeyPair();
  const registrationId = keyhelper.generateRegistrationId();
  const preKeys = await keyhelper.generatePreKeys(0, 100); // 100 one‑time prekeys
  const signedPreKey = await keyhelper.generateSignedPreKey(identityKeyPair, 1);

  // ----- Store public parts only -----
  const device = await prisma.device.create({
    data: {
      UserID: userId,
      IdentityKey: identityKeyPair.pubKey,
      RegistrationId: registrationId,
    },
  });

  // Store prekeys
  const preKeyCreates = preKeys.map((pk) => ({
    DeviceID: device.DeviceID,
    KeyId: pk.keyId,
    PublicKey: pk.keyPair.pubKey,
  }));
  await prisma.preKey.createMany({ data: preKeyCreates });

  // Store signed prekey
  await prisma.signedPreKey.create({
    data: {
      DeviceID: device.DeviceID,
      KeyId: signedPreKey.keyId,
      PublicKey: signedPreKey.keyPair.pubKey,
      Signature: signedPreKey.signature,
    },
  });

  return {
    deviceId: device.DeviceID,
    identityKey: identityKeyPair.pubKey.toString('base64'),
    registrationId,
    preKeys: preKeys.map((p) => ({
      keyId: p.keyId,
      publicKey: p.keyPair.pubKey.toString('base64'),
    })),
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: signedPreKey.keyPair.pubKey.toString('base64'),
      signature: signedPreKey.signature.toString('base64'),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3. Build PreKeyBundle for a remote user (used by client)           */
/* ------------------------------------------------------------------ */
async function getPreKeyBundle(remoteUserId, remoteDeviceId = 1) {
  const device = await prisma.device.findFirst({
    where: { UserID: remoteUserId, DeviceID: remoteDeviceId },
    include: {
      SignedPreKey: true,
      PreKeys: { where: { Used: false }, take: 1 }, // pick first unused
    },
  });

  if (!device) throw new Error('Remote device not found');

  const preKey = device.PreKeys[0];
  if (!preKey) throw new Error('No available prekey');

  return PreKeyBundle.create(
    device.RegistrationId,
    remoteDeviceId,
    preKey.KeyId,
    preKey.PublicKey,
    device.SignedPreKey.KeyId,
    device.SignedPreKey.PublicKey,
    device.SignedPreKey.Signature,
    Buffer.from(device.IdentityKey)
  );
}

/* ------------------------------------------------------------------ */
/* 4. Helper to get a SessionCipher (only for server‑side tests)      */
/* ------------------------------------------------------------------ */
async function getCipher(userId, remoteAddressStr) {
  const store = new PrismaSignalStore(userId);
  const address = SignalProtocolAddress.fromString(remoteAddressStr);
  return new SessionCipher(store, address);
}

/* ------------------------------------------------------------------ */
/* 5. Export                                                             */
/* ------------------------------------------------------------------ */
module.exports = {
  generateDeviceKeys,
  getPreKeyBundle,
  PrismaSignalStore,
  getCipher,
};