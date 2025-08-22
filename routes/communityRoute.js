const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");
const { body, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");

// ✅ Rate limiter for likes and comments (to prevent spam)
const likeCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: "Too many requests, please slow down!",
});

// ✅ Pagination query validation
const paginationValidation = [
  query("page").optional().customSanitizer(value => Number(value) || 1)
    .isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().customSanitizer(value => Number(value) || 10)
    .isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

// ✅ Middleware to validate request data
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// **GET /api/community/posts** - Fetch paginated approved posts
router.get("/posts", paginationValidation, validate, async (req, res, next) => {
  console.log("🚀 Fetching community posts with query:", req.query);

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

    res.status(200).json({ posts, totalPages: Math.ceil(totalPosts / limit) });
  } catch (error) {
    console.error("❌ Error fetching posts:", error);
    next(error);
  }
});

// **GET /api/community/posts/:postId/comments** - Fetch comments for a post
router.get("/posts/:postId/comments", async (req, res, next) => {
  console.log("🚀 Fetching comments for post:", req.params.postId);

  try {
    const { postId } = req.params;
    const post = await Post.findById(postId)
      .select("comments")
      .populate("comments.user", "username profilePic")
      .lean();

    if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

    res.status(200).json(post.comments || []);
  } catch (error) {
    console.error("❌ Error fetching comments:", error);
    next(error);
  }
});

// **POST /api/community/posts/:postId/like** - Like or unlike a post
router.post("/posts/:postId/like", authMiddleware, likeCommentLimiter, async (req, res, next) => {
  console.log("🚀 Like/unlike request for post:", req.params.postId);

  try {
    const { postId } = req.params;
    const userId = req.user._id.toString(); // Ensure proper ID handling

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

    const hasLiked = post.likes.includes(userId);

    // ✅ Use MongoDB operators for efficiency
    const update = hasLiked
      ? { $pull: { likes: userId } }  // Unlike
      : { $addToSet: { likes: userId } };  // Like

    const updatedPost = await Post.findByIdAndUpdate(postId, update, { new: true }).lean();
    res.status(200).json({ likes: updatedPost.likes });
  } catch (error) {
    console.error("❌ Error in like/unlike:", error);
    next(error);
  }
});

// **POST /api/community/posts/:postId/comments** - Add a comment
router.post(
  "/posts/:postId/comments",
  authMiddleware,
  likeCommentLimiter,
  [body("text").trim().notEmpty().withMessage("Comment text is required")],
  validate,
  async (req, res, next) => {
    console.log("🚀 Adding comment to post:", req.params.postId);

    try {
      const { postId } = req.params;
      const { text } = req.body;
      const userId = req.user._id.toString();

      const post = await Post.findById(postId);
      if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

      const comment = {
        user: userId,
        text,
        createdAt: new Date(),
      };

      post.comments.push(comment);
      await post.save();

      // Populate user info for the response
      const populatedPost = await Post.findById(postId)
        .populate("comments.user", "username profilePic")
        .lean();

      const newComment = populatedPost.comments.sort((a, b) => b.createdAt - a.createdAt)[0]; // Get the latest comment

      res.status(201).json(newComment);
    } catch (error) {
      console.error("❌ Error adding comment:", error);
      next(error);
    }
  }
);

// **GET /api/community/tags/trending** - Fetch trending tags
router.get("/tags/trending", paginationValidation, validate, async (req, res, next) => {
  console.log("🚀 Fetching trending tags with query:", req.query);

  try {
    const limit = parseInt(req.query.limit) || 10;

    const tags = await Post.aggregate([
      { $match: { status: "approved" } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $project: { name: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    res.status(200).json(tags);
  } catch (error) {
    console.error("❌ Error fetching trending tags:", error);
    next(error);
  }
});

module.exports = router;
