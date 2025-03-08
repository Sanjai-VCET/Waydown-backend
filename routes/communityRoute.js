const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const upload = require("../middleware/upload");

const likeCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many likes/comments, slow down!",
});

const paginationValidation = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt().withMessage("Limit must be between 1 and 100"),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /api/community/posts
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

// GET /api/community/:postId (Extra, keeping it)
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

// POST /api/community/posts
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

      const images = req.files ? req.files.map((file) => ({
        url: file.path,
        uploadedAt: new Date(),
      })) : []; // Default to empty array if no files

      const post = new Post({
        title: req.body.title,
        content: req.body.content,
        location: req.body.location,
        tags: req.body.tags || [],
        images,
        user: user._id,
        status: "approved", // Auto-approve for now; add moderation if needed
      });

      await post.save();
      const populatedPost = await Post.findById(post._id)
        .populate("user", "username profilePic")
        .lean();

      res.status(201).json({ post: populatedPost, message: "Post created successfully" });
    } catch (error) {
      next(error);
    }
  }
);
// POST /api/community/:postId/like
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

      res.status(200).json({ post: updatedPost, message: "Post liked successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/community/:postId/like (Extra, keeping it)
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

      res.status(200).json({ message: "Post unliked successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/community/:postId/comments
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

      res.status(200).json({ post: updatedPost, message: "Comment added successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/community/:postId/comments (Extra, keeping it)
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

module.exports = router;