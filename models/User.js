const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    isAdmin: { type: Boolean, default: false },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },
    profilePic: {
      type: String,
      default: "",
      match: [
        /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif))?$/,
        "Profile picture must be a valid image URL",
      ],
    },
    bio: {
      type: String,
      default: "",
      maxlength: 160,
      trim: true,
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    interests: {
      type: [String],
      default: ["Nature", "Waterfalls", "Mountains", "Beaches", "Adventure", "Foodie"],
      enum: [
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
      ],
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    lastActive: { 
      type: Date,
      default: Date.now,
    },
    refreshTokens: {
      type: [String],
      default: [],
    },
    isBanned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for performance
UserSchema.index({ location: "2dsphere" });

// Middleware to update lastActive on save
UserSchema.pre("save", function (next) {
  this.lastActive = new Date();
  next();
});

// Prevent password and refreshTokens from being returned in queries
UserSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);