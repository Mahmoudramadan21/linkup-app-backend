const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

/**
 * Uploads file buffer to Cloudinary using streams for memory efficiency
 * @param {Buffer} buffer - File buffer to upload
 * @param {string} folder - Target folder in Cloudinary
 * @param {string} [resourceType="auto"] - Resource type (image, video, raw, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 * @throws {Error} If upload fails
 */
const uploadToCloudinary = async (buffer, folder, resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    // Convert buffer to stream for memory-efficient upload
    const bufferStream = Readable.from(buffer);
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Uploads file to Cloudinary with custom options
 * Formats response to match application needs
 * @param {Buffer} buffer - File buffer to upload
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Formatted upload result with essential fields
 */
const uploadToCloud = async (buffer, options) => {
  const result = await cloudinary.uploader.upload(buffer, options);
  // Standardize response format for consistent API responses
  return {
    secure_url: result.secure_url,
    resource_type: result.resource_type,
    public_id: result.public_id,
    url: result.url,
  };
};

/**
 * Deletes file from Cloudinary using its public ID
 * @param {string} publicId - Cloudinary public ID of the file
 * @returns {Promise<Object>} Cloudinary deletion result
 */
const deleteFromCloudinary = async (publicId) => {
  return await cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadToCloudinary, deleteFromCloudinary, uploadToCloud };
