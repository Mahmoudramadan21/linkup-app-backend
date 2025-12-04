/**
 * Handles errors in the application and sends a generic response
 * @param {Error} err - The error object thrown in the request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorHandler = (err, req, res, next) => {
  // Log the full error stack for debugging
  console.error(err.stack);

  res
    .status(500)
    .json({ message: "Something went wrong!", error: err.message });
};

module.exports = errorHandler;
