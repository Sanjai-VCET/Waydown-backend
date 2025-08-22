const User = require("../models/User");
const { validationResult } = require("express-validator");
const winston = require("winston");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
// Define logger
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

// 📌 Email/Password Signup
exports.signup = async (req, res, next) => {
  logger.info("Signup attempt for email: " + req.body.email + " with display name: " + req.body.displayName);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Validation errors", { errors: errors.array() });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password, displayName } = req.body;

    // Check if email already exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Email already in use", { email });
      return res.status(400).json({ error: "Email already in use" });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user in MongoDB
    const user = new User({
      uid: uuidv4(), // Generate unique uid
      email,
      password: hashedPassword,
      username: displayName,
      profilePic: "",
      bio: "",
      followers: [],
      following: [],
      refreshTokens: [],
    });
    await user.save();

    // Generate JWT access token
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Store refresh token in MongoDB
    user.refreshTokens.push(refreshToken);
    await user.save();

    logger.info("User created successfully with ID: " + user._id);
    res.status(201).json({
      message: "User created successfully",
      userId: user._id,
      email: user.email,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("Signup error", { message: error.message });
    next(error);
  }
};

// 📌 Email/Password Login
exports.login = async (req, res, next) => {
  logger.info("Login attempt for email: " + req.body.email);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Validation errors", { errors: errors.array() });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    // Find user in MongoDB
    const user = await User.findOne({ email });
    if (!user) {
      logger.warn("Invalid credentials", { email });
      return res.status(403).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn("Invalid credentials", { email });
      return res.status(403).json({ error: "Invalid credentials" });
    }

    // Update lastActive
    user.lastActive = new Date();
    
    // Generate JWT access token
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Store refresh token
    user.refreshTokens.push(refreshToken);
    await user.save();

    logger.info("User logged in successfully with ID: " + user._id);
    res.status(200).json({
      message: "User logged in successfully",
      userId: user._id,
      email: user.email,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("Login error", { message: error.message });
    next(error);
  }
};

// 📌 Refresh Token
exports.refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    logger.warn("Missing refresh token");
    return res.status(400).json({ error: "Refresh token required" });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.refreshTokens.includes(refreshToken)) {
      logger.warn("Invalid or expired refresh token", { userId: decoded.userId });
      return res.status(403).json({ error: "Invalid or expired refresh token" });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Optionally generate new refresh token
    const newRefreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Replace old refresh token with new one
    user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    logger.info("Token refreshed successfully for user: " + user._id);
    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error("Refresh token error", { message: error.message });
    return res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

// 📌 Logout
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      logger.warn("User not found for logout", { userId: req.user.userId });
      return res.status(404).json({ error: "User not found" });
    }

    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      await user.save();
      logger.info("User logged out successfully", { userId: user._id });
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error", { message: error.message });
    next(error);
  }
};

// 📌 Delete User Account
exports.deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user.userId;
    const isAdmin = req.user.isAdmin;

    if (req.params.userId && !isAdmin) {
      logger.warn("Unauthorized attempt to delete user", { userId });
      return res.status(403).json({
        error: "Unauthorized: Admin access required to delete other users",
      });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      logger.warn("User not found in MongoDB", { userId });
      return res.status(404).json({ error: "User not found in database" });
    }

    if (req.io) {
      user.followers.forEach((followerId) => {
        req.io.to(followerId.toString()).emit("userDeleted", {
          userId: user._id,
          username: user.username,
        });
      });
    }

    logger.info("User deleted successfully", { userId });
    res.status(200).json({ message: "User account deleted successfully" });
  } catch (error) {
    logger.error("Delete user error", { message: error.message });
    next(error);
  }
};

// 📌 Get User by ID
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username bio profilePic followers following"
    );
    if (!user) {
      logger.warn("User not found", { id: req.params.id });
      return res.status(404).json({ error: "User not found" });
    }
    logger.info("User fetched", { id: req.params.id });
    res.status(200).json(user);
  } catch (error) {
    logger.error("Get user error", { message: error.message });
    next(error);
  }
};