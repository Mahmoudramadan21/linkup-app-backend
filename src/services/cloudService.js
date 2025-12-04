const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const logger = require("../utils/logger");

/**
 * Uploads a file buffer to Cloudinary using streaming
 * @param {Buffer} buffer - File buffer to upload
 * @param {Object} options - Custom upload options
 * @returns {Promise} - Resolves with upload result or rejects with error
 */
const uploadToCloud = async (buffer, options) => {
  return new Promise((resolve, reject) => {
    // Set upload options with defaults
    const uploadOptions = {
      ...options,
      timestamp: Math.round(Date.now() / 1000), // Current timestamp in seconds
      unique_filename: true, // Ensure unique file names
      overwrite: false, // Prevent overwriting existing files
      resource_type: options.resource_type || "auto", // Default to auto
      timeout: 1000000,
    };

    // Log upload options for debugging
    logger.info("Cloudinary upload options:", {
      folder: uploadOptions.folder,
      resource_type: uploadOptions.resource_type,
      allowed_formats: uploadOptions.allowed_formats || "Not specified",
    });

    // Validate allowed formats
    if (
      uploadOptions.allowed_formats &&
      Array.isArray(uploadOptions.allowed_formats)
    ) {
      logger.info(
        `Allowed formats: ${uploadOptions.allowed_formats.join(", ")}`
      );
    } else {
      logger.warn("No allowed_formats specified in upload options");
    }

    // Create upload stream to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          // thinned out error object to prevent prototype pollution
          const errorObject = {
            message: error.message,
            http_code: error.http_code,
            name: error.name,
          };
          // Log detailed error information
          logger.error("Cloudinary upload error:", errorObject);
          return reject(new Error(`Upload failed: ${error.message}`));
        }

        // Check if secure URL is returned
        if (!result?.secure_url) {
          logger.error("No secure URL received from Cloudinary");
          return reject(new Error("No secure URL received from Cloudinary"));
        }

        // Log successful upload
        logger.info("Cloudinary upload successful:", {
          secure_url: result.secure_url,
          resource_type: result.resource_type,
          public_id: result.public_id,
        });
        resolve(result);
      }
    );

    // Convert buffer to readable stream
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null); // Signal end of stream
    bufferStream.pipe(uploadStream); // Pipe buffer to Cloudinary
  });
};

module.exports = { uploadToCloud };
