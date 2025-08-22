const express = require("express");
const router = express.Router();
const winston = require("winston");
const { body, validationResult } = require("express-validator");

// Setup Winston logger (same as server.js)
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /api/errors/404
router.post(
  "/404",
  [
    body("path").notEmpty().withMessage("Path is required"),
    body("message").optional().isString().withMessage("Message must be a string"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { path, message } = req.body;

      // Log the 404 error
      logger.error("404 Error Reported", {
        path,
        message: message || "Page not found",
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      res.status(200).json({ message: "404 error logged successfully" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;