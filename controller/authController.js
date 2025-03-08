const admin = require("../config/firebase"); // Updated path
const User = require("../models/User");
const { validationResult } = require("express-validator");
const winston = require("winston");

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

    // Check if email already exists in Firebase and log the attempt

    try {
      await admin.auth().getUserByEmail(email);
      logger.warn("Email already in use", { email });
      return res.status(400).json({ error: "Email already in use" });
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
    }

    // Create user in Firebase
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    // Sync with MongoDB and log the user creation

    let user = await User.findOne({ uid: userRecord.uid });
    if (!user) {
      user = new User({
        uid: userRecord.uid,
        email,
        username: displayName,
        profilePic: "",
        bio: "",
        followers: [],
        following: [],
      });
      await user.save();
      logger.info("New user created in MongoDB", { uid: userRecord.uid });
    }

    logger.info("User created successfully with UID: " + userRecord.uid);
    res.status(201).json({
      message: "User created successfully",
      uid: userRecord.uid,
      email: userRecord.email,
    });
  } catch (error) {
    logger.error("Signup error", { message: error.message, code: error.code });
    next(error);
  }
};

// 📌 Delete User Account
exports.deleteUser = async (req, res, next) => {
  try {
    const firebaseUid = req.params.uid || req.user.uid;
    const isAdmin = req.user.isAdmin;

    if (req.params.uid && !isAdmin) {
      logger.warn("Unauthorized attempt to delete user", { uid: firebaseUid });
      return res.status(403).json({
        error: "Unauthorized: Admin access required to delete other users",
      });
    }

    await admin.auth().deleteUser(firebaseUid);
    const user = await User.findOneAndDelete({ uid: firebaseUid });
    if (!user) {
      logger.warn("User not found in MongoDB", { uid: firebaseUid });
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

    logger.info("User deleted successfully", { uid: firebaseUid });
    res.status(200).json({ message: "User account deleted successfully" });
  } catch (error) {
    logger.error("Delete user error", {
      message: error.message,
      code: error.code,
    });
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
    logger.error("Get user error", {
      message: error.message,
      code: error.code,
    });
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

    // Authenticate user in Firebase
    const userRecord = await admin.auth().getUserByEmail(email).catch(err => {
        logger.error("Login error", { message: err.message, code: err.code });
        return res.status(403).json({ error: "Invalid credentials" });
    });

    await admin.auth().updateUser(userRecord.uid, { lastLoginAt: new Date() });

    logger.info("User logged in successfully with UID: " + userRecord.uid);
    res.status(200).json({
      message: "User logged in successfully",
      uid: userRecord.uid,
      email: userRecord.email,
    });
  } catch (error) {
    logger.error("Login error", { message: error.message, code: error.code });
    next(error);
  }
}
