const mongoose = require("mongoose");

// Define the Comment sub-schema
const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true } // Ensure each comment has an ID
);

// Define the Image sub-schema
const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Define the Post schema
const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
      maxlength: [2000, "Content cannot exceed 2000 characters"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      maxlength: [200, "Location cannot exceed 200 characters"],
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
    images: [imageSchema],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    likes: [
      {
        type: String, // Store user UIDs
      },
    ],
    comments: [commentSchema],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Indexes for better query performance
postSchema.index({ createdAt: -1 }); // For sorting by creation date
postSchema.index({ tags: 1 }); // For tag-based queries
postSchema.index({ "comments.createdAt": -1 }); // For sorting comments

// Middleware to update updatedAt on save
postSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if a user has liked the post
postSchema.methods.isLikedByUser = function (userId) {
  return this.likes.includes(userId);
};

// Virtual to get like count
postSchema.virtual("likeCount").get(function () {
  return this.likes.length;
});

// Virtual to get comment count
postSchema.virtual("commentCount").get(function () {
  return this.comments.length;
});

// Ensure virtuals are included in toJSON output
postSchema.set("toJSON", { virtuals: true });
postSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Post", postSchema);