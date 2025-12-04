const multer = require("multer");

// Configured multer instance for post file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size per file
    files: 10, // Allow up to 10 files for multi-media posts
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",

      // Videos
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-matroska",
      "video/webm",

      // Audio
      "audio/mpeg",
      "audio/wav",
      "audio/webm",

      // Documents
      "application/pdf",

      // Microsoft Office
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-powerpoint", // .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx

      // Text files
      "text/plain",

      // Compressed archives
      "application/zip",
      "application/x-zip-compressed",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid media type. Allowed types: JPEG, PNG, GIF, WebP, MP4, MOV, AVI, MKV, WebM, MP3, WAV"
        ),
        false
      );
    }
  },
});

module.exports = upload;
