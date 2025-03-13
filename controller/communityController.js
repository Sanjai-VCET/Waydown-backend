const Post = require("../models/Post");

const getPosts = async (req, res, next) => {
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
    next(error);
  }
};

const getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId)
      .select("comments")
      .populate("comments.user", "username profilePic")
      .lean();

    if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

    res.status(200).json(post.comments || []);
  } catch (error) {
    next(error);
  }
};

const likePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const userId = req.user._id.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

    const hasLiked = post.likes.includes(userId);
    const update = hasLiked
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } };

    const updatedPost = await Post.findByIdAndUpdate(postId, update, { new: true }).lean();

    if (req.io) {
      req.io.to(postId).emit("postUpdated", { postId, likes: updatedPost.likes });
    }

    res.status(200).json({ likes: updatedPost.likes });
  } catch (error) {
    next(error);
  }
};

const addComment = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const userId = req.user._id.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: `Post with ID ${postId} not found` });

    const comment = { user: userId, text, createdAt: new Date() };
    post.comments.push(comment);
    await post.save();

    const populatedPost = await Post.findById(postId)
      .populate("comments.user", "username profilePic")
      .lean();

    const newComment = populatedPost.comments.sort((a, b) => b.createdAt - a.createdAt)[0];
    res.status(201).json(newComment);
  } catch (error) {
    next(error);
  }
};

const getTrendingTags = async (req, res, next) => {
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
    next(error);
  }
};

module.exports = { getPosts, getComments, likePost, addComment, getTrendingTags };