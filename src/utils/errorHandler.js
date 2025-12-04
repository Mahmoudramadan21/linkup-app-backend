/**
 * Handles server-side errors and sends a standardized error response
 * @param {Object} res - Express response object
 * @param {Error} error - Error object caught during execution
 * @param {string} [defaultMessage="Internal server error"] - Fallback error message
 */
const handleServerError = (
  res,
  error,
  defaultMessage = "Internal server error"
) => {
  console.error(error);
  res.status(500).json({
    error: error.message || defaultMessage,
  });
};

const handleValidationError = (res, errors) => {
  res.status(400).json({ errors: errors.array() });
};

const handleNotFoundError = (res, message = "Resource not found") => {
  res.status(404).json({ error: message });
};

const handleUnauthorizedError = (res, message = "Unauthorized") => {
  res.status(401).json({ error: message });
};

const handleForbiddenError = (res, message = "Forbidden") => {
  res.status(403).json({ error: message });
};

// Export all error handlers for use in routes or middleware
module.exports = {
  handleServerError,
  handleValidationError,
  handleNotFoundError,
  handleUnauthorizedError,
  handleForbiddenError,
};
