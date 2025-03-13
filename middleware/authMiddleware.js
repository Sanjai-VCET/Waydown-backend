const admin = require("firebase-admin");
const winston = require("winston");



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
// Prevent duplicate initialization
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(
        require("../waydown-dbd87-4930f0814f25.json")
      ),
    });
    logger.info("Firebase Admin SDK initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin SDK", {
      errorMessage: error.message,
      errorCode: error.code,
    });
    throw error; // Stop the app if initialization fails
  }
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
    logger.info("Attempting to verify Firebase ID token", {
      authHeader,
      tokenSnippet: token.substring(0, 10) + "...",
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    console.log('Received token:', token);
    console.log('Token length:', token.length);
    console.log('Token parts:', token.split('.').length);

    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Decoded token:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      iat: decodedToken.iat,
      exp: decodedToken.exp
    });

    req.user = decodedToken;

    // Optionally fetch user from MongoDB to check additional roles
    const User = require("../models/User");
    const user = await User.findOne({ uid: decodedToken.uid });

    if (!user) {
      logger.warn("User not found in MongoDB", {
        uid: decodedToken.uid,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });
      return res.status(404).json({ error: "User not found in database" });
    }

    req.user.isAdmin = user.isAdmin || false;
    logger.info("User authenticated successfully", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isAdmin: req.user.isAdmin,
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    next();
  } catch (error) {
    logger.error("Token verification failed", {
      errorMessage: error.message,
      errorCode: error.code,
      authHeader,
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

// Admin middleware (to protect admin-only routes)
const adminMiddleware = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    logger.warn("Unauthorized admin access attempt", {
      uid: req.user?.uid || "unknown",
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