const express = require("express");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const authController = require("../controller/authController");
const User = require("../models/User");
const { body, param, validationResult } = require("express-validator");

const router = express.Router();

const signupValidation = [
  body("email").isEmail().withMessage("Invalid email address"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("displayName").notEmpty().withMessage("Display name is required")
    .isLength({ min: 3, max: 20 }).withMessage("Display name must be between 3 and 20 characters"),
  body("displayName").matches(/^[a-zA-Z0-9_]+$/).withMessage("Display name can only contain letters, numbers, and underscores"),
];


const validateId = [param("id").isMongoId().withMessage("Invalid user ID")];
const validateUid = [param("uid").isString().withMessage("Invalid UID")];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};


// POST /api/auth/register
router.post("/register", ...signupValidation, validate, authController.signup);

// POST /api/auth/ensure-user
router.post("/ensure-user", authMiddleware, async (req, res, next) => {
  try {
    const { uid, email } = req.user;
    let user = await User.findOne({ uid });

    if (!user) {
      user = new User({
        uid,
        email,
        username: email.split("@")[0],
        profilePic: "",
        bio: "",
        followers: [],
        following: [],
      });
      await user.save();
    } else if (user.email !== email) {
      user.email = email;
      await user.save();
    }

    res.status(200).json({
      _id: user._id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      profilePic: user.profilePic,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      location: user.location,
      interests: user.interests,
      notificationsEnabled: user.notificationsEnabled,
      lastActive: user.lastActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    next(error);
  }
});


router.get("/status", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).select(
      "uid email username isAdmin"
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({
      authenticated: true,
      user: {
        uid: user.uid,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify authentication status" });
  }
});
// DELETE /api/auth/delete
router.delete("/delete", authMiddleware, authController.deleteUser);
router.delete("/delete/:uid", authMiddleware, adminMiddleware, authController.deleteUser);

// GET /api/auth/:id (MongoID-based)
router.get("/:id", validateId, validate, authController.getUserById);

// NEW: GET /api/users/{uid} (UID-based, aligns with my list)
router.get("/uid/:uid", validateUid, validate, async (req, res, next) => {
  try {
    const user = await User.findOne({ uid: req.params.uid }).select(
      "username bio profilePic followers following interests"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.status(200).json({
      uid: user.uid,
      username: user.username,
      bio: user.bio,
      profilePic: user.profilePic,
      followers: user.followers,
      following: user.following,
      interests: user.interests
    });
  } catch (error) {
    next(error);
  }
});



module.exports = router;
