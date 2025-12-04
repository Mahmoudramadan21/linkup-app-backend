const winston = require("winston");
/**
 * Configures Winston logger for application-wide logging
 * Logs to both console and file with timestamped messages
 */
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [],
});

if (!process.env.VERCEL_ENV) {
  logger.add(
    new winston.transports.File({ filename: "logs/error.log", level: "error" })
  );
  logger.add(new winston.transports.File({ filename: "logs/combined.log" }));
}

logger.add(new winston.transports.Console());

module.exports = logger;
