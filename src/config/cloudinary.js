const { v2: cloudinary } = require("cloudinary");

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  api_proxy: process.env.HTTP_PROXY, // Use proxy if provided
  upload_prefix: "https://api.cloudinary.com", // Ensure HTTPS for uploads
});

// Log confirmation of Cloudinary setup
console.log("Cloudinary configured for cloud:", cloudinary.config().cloud_name);

module.exports = cloudinary;
