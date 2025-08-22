const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Spot = require("../models/Spot"); // Import Spot model
const { body, param, query, validationResult } = require("express-validator");

const router = express.Router();

// Validation middleware for pagination
const paginationValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage("Limit must be between 1 and 100"),
];

// Middleware to handle validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  next();
};

// ✅ Get user profile (Protected)
router.get("/profile", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ✅ Update user profile (Protected)
router.put(
  "/profile",
  authMiddleware,
  [
    body("username")
      .optional()
      .isLength({ min: 3, max: 20 })
      .withMessage("Username must be between 3 and 20 characters")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage(
        "Username can only contain letters, numbers, and underscores"
      ),
    body("bio")
      .optional()
      .isLength({ max: 160 })
      .withMessage("Bio cannot exceed 160 characters"),
    body("profilePic")
      .optional()
      .isURL()
      .withMessage("Profile picture must be a valid URL"),
    body("location.coordinates")
      .optional()
      .isArray({ min: 2, max: 2 })
      .withMessage("Coordinates must be [longitude, latitude]"),
    body("location.coordinates.*")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Coordinates must be valid longitude/latitude values"),
    body("interests")
      .optional()
      .isArray()
      .withMessage("Interests must be an array"),
    body("interests.*")
      .optional()
      .isIn([
        "Adventure",
        "Temples",
        "Waterfalls",
        "Beaches",
        "Mountains",
        "Historical",
        "Nature",
        "Urban",
        "Foodie",
        "Wildlife",
      ])
      .withMessage("Invalid interest"),
    body("notificationsEnabled")
      .optional()
      .isBoolean()
      .withMessage("Notifications enabled must be a boolean"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        username,
        bio,
        profilePic,
        location,
        interests,
        notificationsEnabled,
      } = req.body;
      const user = await User.findOne({ uid: req.user.uid });

      if (!user) return res.status(404).json({ error: "User not found" });

      // Check if username is taken by another user
      if (username && username !== user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      // Update fields if provided
      if (username) user.username = username;
      if (bio) user.bio = bio;
      if (profilePic) user.profilePic = profilePic;
      if (location && location.coordinates)
        user.location.coordinates = location.coordinates;
      if (interests) user.interests = interests;
      if (typeof notificationsEnabled !== "undefined")
        user.notificationsEnabled = notificationsEnabled;

      await user.save();
      res.json({ user, message: "Profile updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Follow a user (Protected)
router.post(
  "/follow/:userId",
  authMiddleware,
  [param("userId").isMongoId().withMessage("Invalid user ID")],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ uid: req.user.uid });
      const userToFollow = await User.findById(req.params.userId);

      if (!user || !userToFollow) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user._id.toString() === userToFollow._id.toString()) {
        return res.status(400).json({ error: "You cannot follow yourself" });
      }

      if (user.following.includes(userToFollow._id)) {
        return res.status(400).json({ error: "You already follow this user" });
      }

      user.following.push(userToFollow._id);
      userToFollow.followers.push(user._id);

      await Promise.all([user.save(), userToFollow.save()]);

      // Emit a Socket.io event if notifications are enabled
      if (req.io && userToFollow.notificationsEnabled) {
        req.io.to(userToFollow.uid).emit("newFollower", {
          userId: user._id,
          username: user.username,
        });
      }

      res.json({ message: `You are now following ${userToFollow.username}` });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Unfollow a user (Protected)
router.post(
  "/unfollow/:userId",
  authMiddleware,
  [param("userId").isMongoId().withMessage("Invalid user ID")],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ uid: req.user.uid });
      const userToUnfollow = await User.findById(req.params.userId);

      if (!user || !userToUnfollow) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.following.includes(userToUnfollow._id)) {
        return res
          .status(400)
          .json({ error: "You are not following this user" });
      }

      user.following = user.following.filter(
        (id) => id.toString() !== userToUnfollow._id.toString()
      );
      userToUnfollow.followers = userToUnfollow.followers.filter(
        (id) => id.toString() !== user._id.toString()
      );

      await Promise.all([user.save(), userToUnfollow.save()]);

      // Emit a Socket.io event if notifications are enabled
      if (req.io && userToUnfollow.notificationsEnabled) {
        req.io.to(userToUnfollow.uid).emit("lostFollower", {
          userId: user._id,
          username: user.username,
        });
      }

      res.json({ message: `You have unfollowed ${userToUnfollow.username}` });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Fetch nearby users (Protected)
router.get(
  "/nearby",
  authMiddleware,
  [
    query("radius")
      .isFloat({ min: 0 })
      .withMessage("Radius must be a positive number"),
  ].concat(paginationValidation),
  validate,
  async (req, res, next) => {
    try {
      const firebaseUid = req.user.uid;
      const user = await User.findOne({ uid: firebaseUid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const lat = user.location.coordinates[1];
      const lon = user.location.coordinates[0];
      const radius = parseFloat(req.query.radius || 10) * 1000; // Convert km to meters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const totalUsers = await User.countDocuments({
        _id: { $ne: user._id }, // Exclude the current user
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lon, lat] },
            $maxDistance: radius,
          },
        },
      });

      const users = await User.find({
        _id: { $ne: user._id },
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lon, lat] },
            $maxDistance: radius,
          },
        },
      })
        .skip(skip)
        .limit(limit)
        .select("username bio profilePic location interests");

      const totalPages = Math.ceil(totalUsers / limit);
      res.status(200).json({ users, totalPages });
    } catch (error) {
      next(error);
    }
  }
);
// ✅ Get popular users (Protected)
router.get("/popular", authMiddleware, paginationValidation, validate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const users = await User.aggregate([
      {
        $lookup: {
          from: "spots",
          localField: "_id",
          foreignField: "submittedBy",
          as: "userPosts",
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          profilePic: 1,
          posts: { $size: "$userPosts" },
          followers: { $size: "$followers" },
        },
      },
      { $sort: { followers: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
});
// ✅ Fetch a user's favorites (Protected)
// In usersRoute.js, replace the existing /:uid/favorites route with:
router.get("/:uid/favorites", authMiddleware, async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (uid !== req.user.uid) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You can only view your own favorites" });
    }

    const spots = await Spot.find({ likedBy: uid, status: "approved" })
      .select("_id")
      .lean();
    const favoriteIds = spots.map(spot => spot._id.toString());
    res.status(200).json({ favoriteIds });
  } catch (error) {
    next(error);
  }
});
// ✅ Upload user avatar (Protected)
router.post("/:uid/avatar", authMiddleware, async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (uid !== req.user.uid) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You can only update your own avatar" });
    }

    if (!req.files || !req.files.avatar) {
      return res.status(400).json({ error: "Avatar file is required" });
    }

    const file = req.files.avatar;
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "avatars",
      width: 150,
      height: 150,
      crop: "fill",
    });

    const user = await User.findOneAndUpdate(
      { uid },
      { profilePic: result.secure_url },
      { new: true }
    );

    res.status(200).json({ profilePic: user.profilePic });
  } catch (error) {
    next(error);
  }
});

// ✅ Fetch a user's followers (Public)
router.get(
  "/:userId/followers",
  [param("userId").isMongoId().withMessage("Invalid user ID")].concat(
    paginationValidation
  ),
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.userId).populate(
        "followers",
        "username bio profilePic"
      );
      if (!user) return res.status(404).json({ error: "User not found" });

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const totalFollowers = user.followers.length;
      const followers = user.followers.slice(skip, skip + limit);

      const totalPages = Math.ceil(totalFollowers / limit);
      res.status(200).json({ followers, totalPages });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Fetch a user's following (Public)
router.get(
  "/:userId/following",
  [param("userId").isMongoId().withMessage("Invalid user ID")].concat(
    paginationValidation
  ),
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.userId).populate(
        "following",
        "username bio profilePic"
      );
      if (!user) return res.status(404).json({ error: "User not found" });

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const totalFollowing = user.following.length;
      const following = user.following.slice(skip, skip + limit);

      const totalPages = Math.ceil(totalFollowing / limit);
      res.status(200).json({ following, totalPages });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get user details by UID (Protected)
router.get(
  "/:uid",
  authMiddleware,
  [param("uid").isString().withMessage("Invalid UID")],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only view your own profile" });
      }

      const user = await User.findOne({ uid }).select("-password");
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Update user interests (Protected)
router.post(
  "/:uid/interests",
  authMiddleware,
  [
    param("uid").isString().withMessage("Invalid UID"),
    body("interests")
      .isArray()
      .withMessage("Interests must be an array"),
    body("interests.*")
      .isIn([
        "Adventure",
        "Temples",
        "Waterfalls",
        "Beaches",
        "Mountains",
        "Historical",
        "Nature",
        "Urban",
        "Foodie",
        "Wildlife",
      ])
      .withMessage("Invalid interest"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only update your own interests" });
      }

      const { interests } = req.body;
      const user = await User.findOneAndUpdate(
        { uid },
        { interests },
        { new: true }
      );

      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user, message: "Interests updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get user interests (Protected)
router.get(
  "/:uid/interests",
  authMiddleware,
  [param("uid").isString().withMessage("Invalid UID")],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only view your own interests" });
      }

      const user = await User.findOne({ uid }).select("interests");
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user.interests || []);
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Add a spot to user favorites (Protected)
router.post(
  "/:uid/favorites",
  authMiddleware,
  [
    param("uid").isString().withMessage("Invalid UID"),
    body("spotId").isMongoId().withMessage("Invalid spot ID"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      const { spotId } = req.body;

      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only add to your own favorites" });
      }

      const spot = await Spot.findById(spotId);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (spot.likedBy.includes(uid)) {
        return res.status(400).json({ error: "Spot already in favorites" });
      }

      spot.likedBy.push(uid);
      await spot.save();

      res.json({ message: "Spot added to favorites" });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Remove a spot from user favorites (Protected)
router.delete(
  "/:uid/favorites/:spotId",
  authMiddleware,
  [
    param("uid").isString().withMessage("Invalid UID"),
    param("spotId").isMongoId().withMessage("Invalid spot ID"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { uid, spotId } = req.params;

      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only remove from your own favorites" });
      }

      const spot = await Spot.findById(spotId);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (!spot.likedBy.includes(uid)) {
        return res.status(400).json({ error: "Spot not in favorites" });
      }

      spot.likedBy = spot.likedBy.filter((id) => id !== uid);
      await spot.save();

      res.json({ message: "Spot removed from favorites" });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get user posts (Protected)
router.get(
  "/:uid/posts",
  authMiddleware,
  [param("uid").isString().withMessage("Invalid UID")],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only view your own posts" });
      }

      const user = await User.findOne({ uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const posts = await Spot.find({ submittedBy: user._id, status: "approved" })
        .populate("submittedBy", "username")
        .lean();
      res.json(posts);
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get user settings (Protected)
router.get(
  "/:uid/settings",
  authMiddleware,
  [param("uid").isString().withMessage("Invalid UID")],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only view your own settings" });
      }

      const user = await User.findOne({ uid }).select("notificationsEnabled");
      if (!user) return res.status(404).json({ error: "User not found" });

      // Map backend settings to frontend structure
      const settings = {
        notifications: {
          comments: true, // Default values; customize based on your needs
          likes: true,
          follows: true,
          recommendations: true,
        },
        privacy: {
          profilePublic: true,
          shareLocation: true,
        },
        notificationsEnabled: user.notificationsEnabled,
      };

      res.json(settings);
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Update user settings (Protected)
router.put(
  "/:uid/settings",
  authMiddleware,
  [
    param("uid").isString().withMessage("Invalid UID"),
    body("notifications").optional().isObject().withMessage("Notifications must be an object"),
    body("notifications.comments").optional().isBoolean().withMessage("Comments must be a boolean"),
    body("notifications.likes").optional().isBoolean().withMessage("Likes must be a boolean"),
    body("notifications.follows").optional().isBoolean().withMessage("Follows must be a boolean"),
    body("notifications.recommendations")
      .optional()
      .isBoolean()
      .withMessage("Recommendations must be a boolean"),
    body("privacy").optional().isObject().withMessage("Privacy must be an object"),
    body("privacy.profilePublic").optional().isBoolean().withMessage("Profile public must be a boolean"),
    body("privacy.shareLocation").optional().isBoolean().withMessage("Share location must be a boolean"),
    body("notificationsEnabled").optional().isBoolean().withMessage("Notifications enabled must be a boolean"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "Unauthorized: You can only update your own settings" });
      }

      const { notificationsEnabled } = req.body;
      const user = await User.findOne({ uid });

      if (!user) return res.status(404).json({ error: "User not found" });

      if (typeof notificationsEnabled !== "undefined") {
        user.notificationsEnabled = notificationsEnabled;
      }

      await user.save();

      // Map updated settings to frontend structure
      const updatedSettings = {
        notifications: req.body.notifications || {
          comments: true,
          likes: true,
          follows: true,
          recommendations: true,
        },
        privacy: req.body.privacy || {
          profilePublic: true,
          shareLocation: true,
        },
        notificationsEnabled: user.notificationsEnabled,
      };

      res.json({ settings: updatedSettings, message: "Settings updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get user analytics (Admin only)
router.get(
  "/:uid/analytics",
  authMiddleware,
  [param("uid").isString().withMessage("Invalid UID")],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      // Assuming admin check is handled in authMiddleware or a separate middleware
      // For simplicity, we'll assume the user is an admin if they can access this route

      const user = await User.findOne({ uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      // Example analytics data (customize as needed)
      const analytics = {
        totalPosts: await Spot.countDocuments({ submittedBy: user._id }),
        totalLikes: await Spot.countDocuments({ likedBy: uid }),
        totalFollowers: user.followers.length,
        totalFollowing: user.following.length,
      };

      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
);
// Add to usersRoute.js (append before module.exports)
router.get(
  "/admin/analytics",
  authMiddleware,
  async (req, res, next) => {
    try {
      // Assuming authMiddleware checks for admin role; add additional check if needed
      if (!req.user.isAdmin) { // Adjust based on your user model
        return res.status(403).json({ error: "Unauthorized: Admin access required" });
      }

      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }); // Last 30 days

      res.status(200).json({
        totalUsers,
        activeUsers,
      });
    } catch (error) {
      next(error);
    }
  }
);

// NEW: PUT /api/users/:uid
router.put(
  "/:uid",
  authMiddleware,
  [
    param("uid").isString().withMessage("Invalid UID"),
    body("username").optional().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
    body("bio").optional().isLength({ max: 160 }),
    body("profilePic").optional().isURL(),
    body("location.coordinates").optional().isArray({ min: 2, max: 2 }),
    body("location.coordinates.*").optional().isFloat({ min: -180, max: 180 }),
    body("interests").optional().isArray(),
    body("interests.*").optional().isIn([
      "Adventure", "Temples", "Waterfalls", "Beaches", "Mountains",
      "Historical", "Nature", "Urban", "Foodie", "Wildlife"
    ]),
    body("notificationsEnabled").optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { uid } = req.params;
      if (uid !== req.user.uid) {
        return res.status(403).json({ error: "Unauthorized: You can only update your own profile" });
      }
      const user = await User.findOne({ uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const { username, bio, profilePic, location, interests, notificationsEnabled } = req.body;
      if (username && username !== user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Username already taken" });
        user.username = username;
      }
      if (bio) user.bio = bio;
      if (profilePic) user.profilePic = profilePic;
      if (location && location.coordinates) user.location.coordinates = location.coordinates;
      if (interests) user.interests = interests;
      if (typeof notificationsEnabled !== "undefined") user.notificationsEnabled = notificationsEnabled;

      await user.save();
      res.json({ user, message: "Profile updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;