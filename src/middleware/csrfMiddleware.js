/**
 * Applies CSRF protection to sensitive routes.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const csurf = require("csurf");

const csrfProtection = csurf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  },
  value: (req) => {
    // Check CSRF token in X-CSRF-Token header
    return req.header("X-CSRF-Token") || "";
  },
});

// Middleware to set a non-HttpOnly CSRF token cookie for frontend access
const setCsrfCookie = (req, res, next) => {
  if (!req.csrfToken) {
    console.error("CSRF token function not available");
    return res.status(500).json({ error: "CSRF token generation failed" });
  }
  const token = req.csrfToken();
  if (!token) {
    console.error("CSRF token not generated");
    return res.status(500).json({ error: "CSRF token generation failed" });
  }
  console.log("Setting csrf-token cookie with value:", token);
  res.cookie("csrf-token", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });
  console.log("csrf-token cookie set successfully");
  next();
};

module.exports = { csrfProtection, setCsrfCookie };
