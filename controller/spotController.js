const Spot = require("../models/Spot");
const User = require("../models/User");

const fetchFeed = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.userId;

    const user = await User.findById(userId).select("following interests");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const followedUsers = user.following || [];
    const userIds = [...followedUsers, user._id];

    const totalSpots = await Spot.countDocuments({
      submittedBy: { $in: userIds },
      status: "approved",
    });

    const spots = await Spot.aggregate([
      {
        $match: {
          submittedBy: { $in: userIds },
          status: "approved",
        },
      },
      {
        $addFields: {
          interestScore: {
            $size: {
              $setIntersection: ["$tags", user.interests || []],
            },
          },
        },
      },
      {
        $sort: {
          interestScore: -1,
          createdAt: -1,
        },
      },
      { $skip: (page - 1) * limit },
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
          createdAt: 1,
          bestTimeToVisit: 1,
          uniqueFacts: 1,
          username: "$user.username",
          likes: { $size: "$likedBy" },
          interestScore: 1,
        },
      },
    ]);

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
};

const fetchTrendingSpots = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const spots = await Spot.find({ status: "approved" })
      .sort({ averageRating: -1, "comments.length": -1 })
      .limit(limit)
      .select("name photos averageRating comments content");
    res.status(200).json({ spots });
  } catch (error) {
    next(error);
  }
};

const likeSpot = async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id);
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (spot.status !== "approved")
      return res.status(403).json({ error: "Spot is not approved" });

    const userId = req.user.userId;
    if (spot.likedBy.includes(userId)) {
      return res.status(400).json({ error: "Spot already liked" });
    }

    const updatedSpot = await Spot.findByIdAndUpdate(
      req.params.id,
      { $push: { likedBy: userId } },
      { new: true }
    );

    req.io.to(updatedSpot._id.toString()).emit("spotUpdated", updatedSpot);
    res.status(200).json({ spot: updatedSpot, message: "Spot liked" });
  } catch (error) {
    next(error);
  }
};

const unlikeSpot = async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id);
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (spot.status !== "approved")
      return res.status(403).json({ error: "Spot is not approved" });

    const userId = req.user.userId;
    if (!spot.likedBy.includes(userId)) {
      return res.status(400).json({ error: "Spot not liked yet" });
    }

    const updatedSpot = await Spot.findByIdAndUpdate(
      req.params.id,
      { $pull: { likedBy: userId } },
      { new: true }
    );

    req.io.to(updatedSpot._id.toString()).emit("spotUpdated", updatedSpot);
    res.status(200).json({ spot: updatedSpot, message: "Spot unliked" });
  } catch (error) {
    next(error);
  }
};

const addComment = async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id);
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (spot.status !== "approved")
      return res.status(403).json({ error: "Spot is not approved" });

    const user = await User.findById(req.user.userId).select("username _id");
    if (!user) return res.status(404).json({ error: "User not found" });

    const { content, rating } = req.body;
    if (!content || !rating) {
      return res.status(400).json({ error: "Content and rating are required" });
    }

    const newComment = {
      user: user._id,
      username: user.username,
      content,
      rating,
      createdAt: new Date(),
    };

    spot.comments.push(newComment);
    await spot.save();

    req.io.to(spot._id.toString()).emit("spotUpdated", spot);
    res.status(200).json({ spot, message: "Review added" });
  } catch (error) {
    next(error);
  }
};

const submitSpot = async (req, res, next) => {
  try {
    const { name, content, location, tags, bestTimeToVisit, uniqueFacts } = req.body;
    const photos = req.files ? req.files.map((file) => ({ url: file.path })) : [];
    const user = await User.findById(req.user.userId);

    if (!user) return res.status(404).json({ error: "User not found" });

    const spot = new Spot({
      name,
      content,
      location: {
        type: "Point",
        coordinates: location.coordinates,
      },
      photos,
      tags: tags || [],
      bestTimeToVisit: bestTimeToVisit || "",
      uniqueFacts: uniqueFacts || "",
      submittedBy: user._id,
      status: "pending",
    });

    await spot.save();
    res.status(201).json({ spot, message: "Spot submitted for approval" });
  } catch (error) {
    next(error);
  }
};

const fetchSpot = async (req, res, next) => {
  try {
    const spot = await Spot.findById(req.params.id).populate("submittedBy", "username");
    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (spot.status !== "approved" && !req.user.isAdmin) {
      return res.status(403).json({ error: "Spot is not approved" });
    }

    spot.views = (spot.views || 0) + 1;
    await spot.save();

    res.status(200).json(spot);
  } catch (error) {
    next(error);
  }
};

const deleteSpot = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    const spot = await Spot.findById(req.params.id);

    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (
      !spot.submittedBy ||
      (spot.submittedBy.toString() !== user._id.toString() && !req.user.isAdmin)
    ) {
      return res.status(403).json({ error: "Unauthorized to delete this spot" });
    }

    await spot.deleteOne();
    req.io.to(req.params.id).emit("spotDeleted", { spotId: req.params.id });
    res.status(200).json({ message: "Spot deleted successfully" });
  } catch (error) {
    next(error);
  }
};

const updateSpot = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    const spot = await Spot.findById(req.params.id);

    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (
      !spot.submittedBy ||
      (spot.submittedBy.toString() !== user._id.toString() && !req.user.isAdmin)
    ) {
      return res.status(403).json({ error: "Unauthorized to update this spot" });
    }

    Object.assign(spot, req.body);
    spot.status = "pending";
    await spot.save();

    req.io.to(spot._id.toString()).emit("spotUpdated", spot);
    res.status(200).json({ spot, message: "Spot updated and awaiting re-approval" });
  } catch (error) {
    next(error);
  }
};

const fetchAllSpots = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalSpots = await Spot.countDocuments({ status: "approved" });
    const spots = await Spot.find({ status: "approved" })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "username");

    const totalPages = Math.ceil(totalSpots / limit);
    res.status(200).json({ spots, totalPages });
  } catch (error) {
    next(error);
  }
};

const searchSpots = async (req, res, next) => {
  try {
    const query = req.params.query;
    const spots = await Spot.find(
      {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { content: { $regex: query, $options: "i" } },
          { tags: { $regex: query, $options: "i" } },
          { bestTimeToVisit: { $regex: query, $options: "i" } },
          { uniqueFacts: { $regex: query, $options: "i" } },
        ],
        status: "approved",
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .populate("submittedBy", "username");

    res.status(200).json(spots);
  } catch (error) {
    next(error);
  }
};
const fetchRecommendations = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 3;
    const userId = req.user.userId;

    const user = await User.findById(userId).select("interests");
    if (!user) return res.status(404).json({ error: "User not found" });

    const spots = await Spot.aggregate([
      {
        $match: {
          status: "approved",
          submittedBy: { $ne: userId }, // Exclude user's own spots
        },
      },
      {
        $addFields: {
          interestMatch: {
            $size: {
              $setIntersection: ["$tags", user.interests || []],
            },
          },
        },
      },
      {
        $sort: {
          interestMatch: -1,
          averageRating: -1,
          "comments.length": -1,
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          name: 1,
          photos: 1,
          tags: 1,
          location: 1,
          averageRating: 1,
          comments: 1,
          content: 1,
          likedBy: 1,
        },
      },
    ]);

    res.status(200).json({ spots });
  } catch (error) {
    next(error);
  }
};
const reportSpot = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    const spot = await Spot.findById(req.params.id);

    if (!spot) return res.status(404).json({ error: "Spot not found" });
    if (spot.status !== "approved")
      return res.status(403).json({ error: "Spot is not approved" });

    if (
      spot.reports.some(
        (report) => report.reportedBy.toString() === user._id.toString()
      )
    ) {
      return res.status(400).json({ error: "You have already reported this spot" });
    }

    spot.reports.push({ reportedBy: user._id, reason: req.body.reason });
    await spot.save();

    res.status(200).json({ spot, message: "Spot reported successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  fetchFeed,
  fetchTrendingSpots,
  fetchRecommendations,
  likeSpot,
  unlikeSpot,
  addComment,
  submitSpot,
  fetchSpot,
  deleteSpot,
  updateSpot,
  fetchAllSpots,
  searchSpots,
  reportSpot,
};