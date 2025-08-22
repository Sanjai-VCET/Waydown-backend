const jwt = require("jsonwebtoken");
const winston = require("winston");
const User = require("../models/User");

// Setup Winston logger
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

// Main auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("Missing or invalid Authorization header", {
      authHeader: authHeader || "none",
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing or invalid Authorization header" });
  }

  let token = authHeader.split(" ")[1];
  if (!token) {
    logger.warn("Missing token in Authorization header", {
      authHeader,
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  // Clean the token by removing surrounding quotes, if any
  token = token.replace(/^"|"$/g, "").trim();

  // Validate token format (basic JWT format check: three parts separated by dots)
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    logger.warn("Invalid token format: not a JWT", {
      authHeader,
      tokenSnippet: token.substring(0, 10) + "...",
      tokenPartsLength: tokenParts.length,
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    return res
      .status(403)
      .json({
        error:
          "Invalid token: Token must be a valid JWT (header.payload.signature)",
      });
  }

  try {
    logger.info("Attempting to verify JWT", {
      tokenSnippet: token.substring(0, 10) + "...",
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Fetch user from MongoDB to check additional roles
    const user = await User.findById(decoded.userId);
    if (!user) {
      logger.warn("User not found in MongoDB", {
        userId: decoded.userId,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });
      return res.status(404).json({ error: "User not found in database" });
    }

    req.user.isAdmin = user.isAdmin || false;
    logger.info("User authenticated successfully", {
      userId: decoded.userId,
      email: user.email,
      isAdmin: req.user.isAdmin,
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    next();
  } catch (error) {
    logger.error("Token verification failed", {
      errorMessage: error.message,
      tokenSnippet: token.substring(0, 10) + "...",
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    return res
      .status(403)
      .json({ error: "Invalid or expired token", details: error.message });
  }
};

// Admin middleware
const adminMiddleware = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    logger.warn("Unauthorized admin access attempt", {
      userId: req.user?.userId || "unknown",
      method: req.method,
      url: req.url,
      ip: req.ip,
    });
    return res
      .status(403)
      .json({ error: "Unauthorized: Admin access required" });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };