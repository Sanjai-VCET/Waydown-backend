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
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: [1, "Review content must be at least 1 character"],
      maxlength: [500, "Review content cannot exceed 500 characters"],
    },
    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating must be at most 5"],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Define the Image sub-schema
const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif))?$/.test(v);
        },
        message: "Image URL must be a valid image URL",
      },
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Define the Report sub-schema
const reportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: [5, "Report reason must be at least 5 characters"],
      maxlength: [200, "Report reason cannot exceed 200 characters"],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Define the Spot schema
const SpotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
      index: true,
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
      minlength: [10, "Content must be at least 10 characters"],
      maxlength: [1000, "Content cannot exceed 1000 characters"],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, "City name cannot exceed 100 characters"],
      default: "",
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, "Coordinates are required"],
        validate: {
          validator: function (v) {
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 && // Longitude
              v[1] >= -90 &&
              v[1] <= 90 // Latitude
            );
          },
          message: "Coordinates must be [longitude, latitude] with valid ranges",
        },
      },
    },
    photos: {
      type: [imageSchema],
      default: [],
    },
    tags: {
      type: [String],
      default: ["Nature"],
      enum: [
        "Adventure", "Temples", "Waterfalls", "Beaches", "Mountains",
    "Historical", "Nature", "Urban", "Foodie", "Wildlife"
      ],
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Moderate", "Hard", "Unknown"],
      default: "Unknown",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "SubmittedBy is required"],
      index: true,
    },
    likedBy: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length === new Set(v).size; // Ensure unique UIDs
        },
        message: "likedBy must contain unique user IDs",
      },
    },
    comments: [commentSchema],
    reports: [reportSchema],
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    bestTimeToVisit: {
      type: String,
      trim: true,
      maxlength: [100, "Best time to visit cannot exceed 100 characters"],
      default: "",
    },
    uniqueFacts: {
      type: String,
      trim: true,
      maxlength: [500, "Unique facts cannot exceed 500 characters"],
      default: "",
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    view360: {
      imageUrl: {
        type: String,
        default: "",
        validate: {
          validator: function (v) {
            return !v || /^(https?:\/\/.*\.(?:jpg|jpeg|png|gif|mp4))?$/.test(v);
          },
          message: "360 view URL must be a valid image or video URL",
        },
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, "360 view description cannot exceed 200 characters"],
        default: "",
      },
    },
  },
  { timestamps: true }
);

// Indexes for performance
SpotSchema.index({ location: "2dsphere" });
SpotSchema.index({ createdAt: -1 });
SpotSchema.index({ likedBy: 1 });
SpotSchema.index({ "comments.createdAt": -1 });
SpotSchema.index({ uniqueFacts: "text", bestTimeToVisit: "text" });

// Pre-save middleware to ensure tags are lowercase and compute averageRating
SpotSchema.pre("save", function (next) {
  if (this.tags && this.tags.length > 0) {
   
  }
  // Update averageRating based on comments
  if (this.isModified("comments")) {
    const ratings = this.comments
      .map((comment) => comment.rating)
      .filter((rating) => rating !== undefined);
    this.averageRating =
      ratings.length > 0
        ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
        : 0;
  }
  next();
});

// Virtual to get like count
SpotSchema.virtual("likeCount").get(function () {
  return this.likedBy.length;
});

// Virtual to get comment count
SpotSchema.virtual("commentCount").get(function () {
  return this.comments.length;
});

// Ensure virtuals are included in toJSON output
SpotSchema.set("toJSON", { virtuals: true });
SpotSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Spot", SpotSchema);