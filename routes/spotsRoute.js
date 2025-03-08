const express = require("express");
const router = express.Router();
const Spot = require("../models/Spot");
const User = require("../models/User");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const upload = require("../middleware/upload");

const likeCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many likes/comments, slow down!",
});

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

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Fetch all spots (with pagination)
router.get("/", paginationValidation, validate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalSpots = await Spot.countDocuments({ status: "approved" });
    const spots = await Spot.find({ status: "approved" })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "username profilePic")
      .lean();

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
});

// Fetch personalized feed (with pagination)
router.get("/feed", authMiddleware, paginationValidation, validate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: "User not found" });

    const totalSpots = await Spot.countDocuments({
      tags: { $in: user.interests },
      status: "approved",
    });
    const spots = await Spot.find({
      tags: { $in: user.interests },
      status: "approved",
    })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "username profilePic")
      .lean();

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
});
// Admin analytics for spots
router.get("/admin/analytics", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    const totalSpots = await Spot.countDocuments({ status: "approved" });
    console.error("Error fetching total spots:", error); // Log the error for debugging

    console.error("Error fetching total spots:", error); // Log the error for debugging

    const totalPosts = await Post.countDocuments(); // Assumes Post model exists

    const popularCategories = await Spot.aggregate([
      { $match: { status: "approved" } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { name: "$_id", count: 1, _id: 0 } },
    ]);

    const popularSpots = await Spot.find({ status: "approved" })
      .sort({ "likedBy.length": -1 })
      .limit(5)
      .select("name likedBy views")
      .lean()
      .then((spots) =>
        spots.map((spot) => ({
          id: spot._id,
          name: spot.name,
          views: spot.views,
          saves: spot.likedBy.length,
        }))
      );

    res.status(200).json({
      totalSpots,
      totalPosts,
      popularCategories,
      popularSpots,
    });
  } catch (error) {
    next(error);
  }
});

// Fetch personalized recommendations (with pagination)
router.get("/recommend", authMiddleware, paginationValidation, validate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: "User not found" });

    const totalSpots = await Spot.countDocuments({
      tags: { $in: user.interests },
      likedBy: { $nin: [req.user.uid] },
      status: "approved",
    });
    const spots = await Spot.find({
      tags: { $in: user.interests },
      likedBy: { $nin: [req.user.uid] },
      status: "approved",
    })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "username profilePic")
      .lean();

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
});
// Fetch trending spots
router.get("/trending", paginationValidation, validate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const totalSpots = await Spot.countDocuments({ status: "approved" });

    const spots = await Spot.aggregate([
      { $match: { status: "approved" } },
      {
        $project: {
          name: 1,
          content: 1,
          photos: 1,
          location: 1,
          tags: 1,
          likedBy: 1,
          comments: 1,
          views: 1,
          submittedBy: 1,
          createdAt: 1,
          likeCount: { $size: "$likedBy" },
          commentCount: { $size: "$comments" },
        },
      },
      {
        $sort: {
          likeCount: -1,
          commentCount: -1,
          createdAt: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "submittedBy",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          name: 1,
          content: 1,
          photos: 1,
          location: 1,
          tags: 1,
          likedBy: 1,
          comments: 1,
          views: 1,
          createdAt: 1,
          username: "$user.username",
          profilePic: "$user.profilePic",
          likeCount: 1,
          commentCount: 1,
        },
      },
    ]);

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
});

// Fetch spots by distance
router.get(
  "/nearby",
  [
    query("lat").isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
    query("lon").isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
    query("radius").isFloat({ min: 0 }).withMessage("Radius must be a positive number"),
  ].concat(paginationValidation),
  validate,
  async (req, res, next) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);
      const radius = parseFloat(req.query.radius) * 1000; // Convert km to meters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const totalSpots = await Spot.countDocuments({
        location: {
          $geoWithin: {
            $centerSphere: [[lon, lat], radius / 6378137] // Convert meters to radians
          }
        },
        status: "approved",
      });

      const spots = await Spot.find({
        location: {
          $geoWithin: {
            $centerSphere: [[lon, lat], radius / 6378137]
          }
        },
        status: "approved",
      })
        .skip(skip)
        .limit(limit)
        .populate("submittedBy", "username profilePic")
        .lean();

      const totalPages = Math.ceil(totalSpots / limit);
      res.status(200).json({ spots, totalPages });
    } catch (error) {
      next(error);
    }
  }
);
// Search spots by query
router.get(
  "/search",
  [query("query").notEmpty().withMessage("Search query is required")].concat(paginationValidation),
  validate,
  async (req, res, next) => {
    try {
      const { query: searchQuery, page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const totalSpots = await Spot.countDocuments({
        $or: [
          { name: { $regex: searchQuery, $options: "i" } },
          { content: { $regex: searchQuery, $options: "i" } },
          { tags: { $in: [new RegExp(searchQuery, "i")] } },
        ],
        status: "approved",
      });

      const spots = await Spot.find({
        $or: [
          { name: { $regex: searchQuery, $options: "i" } },
          { content: { $regex: searchQuery, $options: "i" } },
          { tags: { $in: [new RegExp(searchQuery, "i")] } },
        ],
        status: "approved",
      })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("submittedBy", "username profilePic")
        .lean();

      const totalPages = Math.ceil(totalSpots / limit);
      res.status(200).json({ spots, totalPages });
    } catch (error) {
      next(error);
    }
  }
);

// Fetch search suggestions
router.get(
  "/search/suggestions",
  [query("q").notEmpty().withMessage("Search query is required")],
  validate,
  async (req, res, next) => {
    try {
      const searchQuery = req.query.q;

      const spots = await Spot.find({
        $or: [
          { name: { $regex: searchQuery, $options: "i" } },
          { content: { $regex: searchQuery, $options: "i" } },
          { tags: { $in: [new RegExp(searchQuery, "i")] } },
        ],
        status: "approved",
      })
        .limit(10)
        .select("name tags")
        .lean();

      const suggestions = new Set();
      spots.forEach((spot) => {
        if (spot.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          suggestions.add(spot.name);
        }
        spot.tags.forEach((tag) => {
          if (tag.toLowerCase().includes(searchQuery.toLowerCase())) {
            suggestions.add(tag);
          }
        });
      });

      res.status(200).json([...suggestions].slice(0, 10));
    } catch (error) {
      next(error);
    }
  }
);

// Filter spots by tags
router.get("/tags/:tag", paginationValidation, [param("tag").notEmpty().withMessage("Tag is required")], validate, async (req, res, next) => {
  try {
    const tag = req.params.tag;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalSpots = await Spot.countDocuments({ tags: tag, status: "approved" });
    const spots = await Spot.find({ tags: tag, status: "approved" })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "username profilePic")
      .lean();

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
});


// Fetch a single spot by ID
router.get("/:id", [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id)
      .populate("submittedBy", "username profilePic")
      .populate("comments.user", "username profilePic")
      .lean();
    if (!spot) return res.status(404).json({ error: "Spot not found" });

    await Spot.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.status(200).json(spot);
  } catch (error) {
    next(error);
  }
});

// Fetch spot images
router.get("/:id/images", [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id).select("photos").lean();
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    res.status(200).json(spot.photos || []);
  } catch (error) {
    next(error);
  }
});

// Upload images to a spot
router.post(
  "/:id/images",
  authMiddleware,
  upload.array("images", 10),
  [param("id").isMongoId().withMessage("Invalid spot ID")],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (spot.submittedBy.toString() !== req.user.uid) {
        return res.status(403).json({ error: "Unauthorized: You can only add images to your own spots" });
      }

      const newImages = req.files.map((file) => ({
        url: file.path,
        uploadedAt: new Date(),
      }));

      spot.photos = [...spot.photos, ...newImages];
      await spot.save();

      res.status(200).json({ photos: spot.photos, message: "Images uploaded successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// Fetch spot reviews
router.get("/:id/reviews", [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id)
      .populate("comments.user", "username profilePic")
      .lean();
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    res.status(200).json(spot.comments || []);
  } catch (error) {
    next(error);
  }
});

// Add a review to a spot
router.post(
  "/:id/reviews",
  authMiddleware,
  likeCommentLimiter,
  [
    param("id").isMongoId().withMessage("Invalid spot ID"),
    body("content").notEmpty().withMessage("Review content is required"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      const user = await User.findOne({ uid: req.user.uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const review = {
        user: user._id,
        username: user.username,
        content: req.body.content,
        rating: parseInt(req.body.rating),
        createdAt: new Date(),
      };

      spot.comments.push(review);
      await spot.save();

      if (req.io && spot.submittedBy.toString() !== req.user.uid) {
        const spotCreator = await User.findOne({ uid: spot.submittedBy.toString() });
        if (spotCreator && spotCreator.notificationsEnabled) {
          req.io.to(spot.submittedBy.toString()).emit("newComment", {
            spotId: spot._id,
            comment: review,
          });
        }
      }

      res.status(200).json(review);
    } catch (error) {
      next(error);
    }
  }
);

// Fetch nearby spots for a given spot
router.get("/:id/nearby", [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id).lean();
    if (!spot) return res.status(404).json({ error: "Spot not found" });

    const lat = spot.location.coordinates[1];
    const lon = spot.location.coordinates[0];
    const radius = 10 * 1000; // 10 km in meters

    const spots = await Spot.find({
      _id: { $ne: spot._id },
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lon, lat] },
          $maxDistance: radius,
        },
      },
      status: "approved",
    })
      .limit(5)
      .populate("submittedBy", "username profilePic")
      .lean();

    res.status(200).json({ spots });
  } catch (error) {
    next(error);
  }
});

// Fetch 360-degree view data
router.get("/:id/360-view", [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id).select("view360").lean();
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    res.status(200).json(spot.view360 || {});
  } catch (error) {
    next(error);
  }
});

// Submit a new spot
router.post(
  "/",
  authMiddleware,
  upload.array("photos", 100),
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("content").notEmpty().withMessage("Content is required"),
    body("location.coordinates")
      .isArray({ min: 2, max: 2 })
      .withMessage("Coordinates must be [longitude, latitude]"),
    body("location.coordinates.*")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Coordinates must be valid longitude/latitude values"),
    body("city").optional().isLength({ max: 100 }).withMessage("City name cannot exceed 100 characters"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("tags.*")
      .optional()
      .isIn(["Adventure", "Temples", "Waterfalls", "Beaches", "Mountains", "Historical", "Nature", "Urban", "Foodie", "Wildlife"])
      .withMessage("Invalid tag"),
    body("difficulty")
      .optional()
      .isIn(["Easy", "Moderate", "Hard", "Unknown"])
      .withMessage("Invalid difficulty level"),
    body("bestTimeToVisit")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Best time to visit cannot exceed 100 characters"),
    body("uniqueFacts")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Unique facts cannot exceed 500 characters"),
    body("view360.imageUrl").optional().isURL().withMessage("360 view image URL must be a valid URL"),
    body("view360.description")
      .optional()
      .isLength({ max: 200 })
      .withMessage("360 view description cannot exceed 200 characters"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ uid: req.user.uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const photos = req.files.map((file) => ({
        url: file.path,
        uploadedAt: new Date(),
      }));

      const spot = new Spot({
        name: req.body.name,
        content: req.body.content,
        location: {
          type: "Point",
          coordinates: req.body.location.coordinates,
        },
        city: req.body.city || "",
        tags: req.body.tags || [],
        difficulty: req.body.difficulty || "Unknown",
        photos,
        bestTimeToVisit: req.body.bestTimeToVisit || "",
        uniqueFacts: req.body.uniqueFacts || "",
        view360: {
          imageUrl: req.body.view360?.imageUrl || "",
          description: req.body.view360?.description || "",
        },
        submittedBy: user._id,
        status: "pending",
      });

      await spot.save();
      res.status(201).json({ spot, message: "Spot submitted successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// Update a spot
router.put(
  "/:id",
  authMiddleware,
  [
    param("id").isMongoId().withMessage("Invalid spot ID"),
    body("name").optional().notEmpty().withMessage("Name cannot be empty"),
    body("content").optional().notEmpty().withMessage("Content cannot be empty"),
    body("location.coordinates")
      .optional()
      .isArray({ min: 2, max: 2 })
      .withMessage("Coordinates must be [longitude, latitude]"),
    body("location.coordinates.*")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Coordinates must be valid longitude/latitude values"),
    body("city").optional().isLength({ max: 100 }).withMessage("City name cannot exceed 100 characters"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("tags.*")
      .optional()
      .isIn(["Adventure", "Temples", "Waterfalls", "Beaches", "Mountains", "Historical", "Nature", "Urban", "Foodie", "Wildlife"])
      .withMessage("Invalid tag"),
    body("difficulty")
      .optional()
      .isIn(["Easy", "Moderate", "Hard", "Unknown"])
      .withMessage("Invalid difficulty level"),
    body("bestTimeToVisit")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Best time to visit cannot exceed 100 characters"),
    body("uniqueFacts")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Unique facts cannot exceed 500 characters"),
    body("view360.imageUrl").optional().isURL().withMessage("360 view image URL must be a valid URL"),
    body("view360.description")
      .optional()
      .isLength({ max: 200 })
      .withMessage("360 view description cannot exceed 200 characters"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (spot.submittedBy.toString() !== req.user.uid) {
        return res.status(403).json({ error: "Unauthorized: You can only edit your own spots" });
      }

      spot.name = req.body.name || spot.name;
      spot.content = req.body.content || spot.content;
      spot.location = req.body.location || spot.location;
      spot.city = req.body.city || spot.city;
      spot.tags = req.body.tags || spot.tags;
      spot.difficulty = req.body.difficulty || spot.difficulty;
      spot.bestTimeToVisit = req.body.bestTimeToVisit || spot.bestTimeToVisit;
      spot.uniqueFacts = req.body.uniqueFacts || spot.uniqueFacts;
      spot.view360 = req.body.view360 || spot.view360;

      await spot.save();
      res.status(200).json({ spot, message: "Spot updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// Admin: Update spot status
router.patch(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  [param("id").isMongoId().withMessage("Invalid spot ID"), body("status").isIn(["pending", "approved", "rejected"]).withMessage("Invalid status")],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      spot.status = req.body.status;
      await spot.save();

      if (req.io && spot.status !== "pending") {
        req.io.to(spot.submittedBy.toString()).emit("spotStatusUpdated", {
          spotId: spot._id,
          status: spot.status,
        });
      }

      res.status(200).json({ spot, message: "Spot status updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// Delete a spot
router.delete("/:id", authMiddleware, [param("id").isMongoId().withMessage("Invalid spot ID")], validate, async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id);
    if (!spot) return res.status(404).json({ error: "Spot not found" });

    if (spot.submittedBy.toString() !== req.user.uid && !req.user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized: You can only delete your own spots" });
    }

    await spot.deleteOne();
    res.status(200).json({ message: "Spot deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Like a spot
router.post(
  "/:id/like",
  authMiddleware,
  likeCommentLimiter,
  [param("id").isMongoId().withMessage("Invalid spot ID")],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (spot.likedBy.includes(req.user.uid)) {
        return res.status(400).json({ error: "Spot already liked" });
      }

      spot.likedBy.push(req.user.uid);
      await spot.save();

      if (req.io && spot.submittedBy.toString() !== req.user.uid) {
        const user = await User.findOne({ uid: spot.submittedBy.toString() });
        if (user && user.notificationsEnabled) {
          req.io.to(spot.submittedBy.toString()).emit("newLike", {
            spotId: spot._id,
            userId: req.user.uid,
          });
        }
      }

      res.status(200).json({ message: "Spot liked successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// Unlike a spot
router.post(
  "/:id/unlike",
  authMiddleware,
  likeCommentLimiter,
  [param("id").isMongoId().withMessage("Invalid spot ID")],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      if (!spot.likedBy.includes(req.user.uid)) {
        return res.status(400).json({ error: "Spot not liked" });
      }

      spot.likedBy = spot.likedBy.filter((uid) => uid !== req.user.uid);
      await spot.save();

      res.status(200).json({ message: "Spot unliked successfully" });
    } catch (error) {
      next(error);
    }
  }
);



// Report a spot
router.post(
  "/:id/report",
  authMiddleware,
  [param("id").isMongoId().withMessage("Invalid spot ID"), body("reason").notEmpty().withMessage("Report reason is required")],
  validate,
  async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) return res.status(404).json({ error: "Spot not found" });

      const user = await User.findOne({ uid: req.user.uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const report = {
        reportedBy: user._id,
        reason: req.body.reason,
        createdAt: new Date(),
      };

      spot.reports.push(report);
      await spot.save();

      if (req.io) {
        const admins = await User.find({ isAdmin: true }).select("uid");
        admins.forEach((admin) => {
          req.io.to(admin.uid).emit("newReport", {
            spotId: spot._id,
            userId: user.uid,
            reason: req.body.reason,
          });
        });
      }

      res.status(200).json({ message: "Spot reported successfully" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;