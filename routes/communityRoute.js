const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const upload = require("../middleware/upload");

// Rate limiter for likes and comments
const likeCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: "Too many likes/comments, slow down!",
});

// Pagination query parameter validation
const paginationValidation = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt().withMessage("Limit must be between 1 and 100"),
];

// Middleware to validate request data
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// **GET /api/community/posts** - Fetch paginated approved posts
router.get("/", paginationValidation, validate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalPosts = await Post.countDocuments({ status: "approved" });
    const posts = await Post.find({ status: "approved" })
      .skip(skip)
      .limit(limit)
      .populate("user", "username profilePic")
      .lean();

    const totalPages = Math.ceil(totalPosts / limit);
    res.status(200).json({ posts, totalPages });
  } catch (error) {
    next(error);
  }
});

// **GET /api/community/:postId** - Fetch a single post by ID
router.get(
  "/:postId",
  [param("postId").isMongoId().withMessage("Invalid post ID")],
  validate,
  async (req, res, next) => {
    try {
      const post = await Post.findById(req.params.postId)
        .populate("user", "username profilePic")
        .lean();
      if (!post) return res.status(404).json({ error: "Post not found" });
      res.status(200).json(post);
    } catch (error) {
      next(error);
    }
  }
);

// **POST /api/community/posts** - Create a new post
router.post(
  "/",
  authMiddleware,
  upload.array("images", 5),
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("content").notEmpty().withMessage("Content is required"),
    body("location").notEmpty().withMessage("Location is required"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ uid: req.user.uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const images = req.files
        ? req.files.map((file) => ({
            url: file.path,
            uploadedAt: new Date(),
          }))
        : [];

      let tags = req.body.tags;
      if (typeof tags === "string") {
        try {
          tags = JSON.parse(tags);
        } catch {
          tags = [];
        }
      }

      const post = new Post({
        title: req.body.title,
        content: req.body.content,
        location: req.body.location,
        tags: tags || [],
        images,
        user: user._id,
        likes: [],
        comments: [],
        status: "approved",
      });

      await post.save();
      const populatedPost = await Post.findById(post._id)
        .populate("user", "username profilePic")
        .lean();

      res.status(201).json({ post: populatedPost });
    } catch (error) {
      next(error);
    }
  }
);

// **POST /api/community/:postId/like** - Like a post
router.post(
  "/:postId/like",
  authMiddleware,
  likeCommentLimiter,
  [param("postId").isMongoId().withMessage("Invalid post ID")],
  validate,
  async (req, res, next) => {
    try {
      const post = await Post.findById(req.params.postId);
      if (!post) return res.status(404).json({ error: "Post not found" });

      if (post.likes.includes(req.user.uid)) {
        return res.status(400).json({ error: "Post already liked" });
      }

      post.likes.push(req.user.uid);
      await post.save();

      const updatedPost = await Post.findById(post._id)
        .populate("user", "username profilePic")
        .lean();

      res.status(200).json({ post: updatedPost });
    } catch (error) {
      next(error);
    }
  }
);

// **DELETE /api/community/:postId/like** - Unlike a post
router.delete(
  "/:postId/like",
  authMiddleware,
  likeCommentLimiter,
  [param("postId").isMongoId().withMessage("Invalid post ID")],
  validate,
  async (req, res, next) => {
    try {
      const post = await Post.findById(req.params.postId);
      if (!post) return res.status(404).json({ error: "Post not found" });

      if (!post.likes.includes(req.user.uid)) {
        return res.status(400).json({ error: "Post not liked" });
      }

      post.likes = post.likes.filter((uid) => uid !== req.user.uid);
      await post.save();

      const updatedPost = await Post.findById(post._id)
        .populate("user", "username profilePic")
        .lean();

      res.status(200).json({ post: updatedPost });
    } catch (error) {
      next(error);
    }
  }
);

// **POST /api/community/:postId/comments** - Add a comment to a post
router.post(
  "/:postId/comments",
  authMiddleware,
  likeCommentLimiter,
  [
    param("postId").isMongoId().withMessage("Invalid post ID"),
    body("text").notEmpty().withMessage("Comment text is required"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const post = await Post.findById(req.params.postId);
      if (!post) return res.status(404).json({ error: "Post not found" });

      const user = await User.findOne({ uid: req.user.uid });
      if (!user) return res.status(404).json({ error: "User not found" });

      const comment = {
        user: user._id,
        username: user.username,
        text: req.body.text,
        createdAt: new Date(),
      };

      post.comments.push(comment);
      await post.save();

      const updatedPost = await Post.findById(post._id)
        .populate("user", "username profilePic")
        .lean();

      res.status(200).json({ post: updatedPost });
    } catch (error) {
      next(error);
    }
  }
);

// **GET /api/community/:postId/comments** - Fetch comments for a post
router.get(
  "/:postId/comments",
  [param("postId").isMongoId().withMessage("Invalid post ID")],
  validate,
  async (req, res, next) => {
    try {
      const post = await Post.findById(req.params.postId)
        .populate("comments.user", "username profilePic")
        .lean();
      if (!post) return res.status(404).json({ error: "Post not found" });
      res.status(200).json(post.comments || []);
    } catch (error) {
      next(error);
    }
  }
);

// **GET /api/community/tags/trending** - Fetch trending tags
router.get("/tags/trending", authMiddleware, paginationValidation, validate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const tags = await Post.aggregate([
      { $match: { status: "approved" } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: "$tags",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          name: "$_id",
          count: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    res.status(200).json(tags);
  } catch (error) {
    next(error);
  }
});

module.exports = router;