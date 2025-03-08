const express = require("express");
const router = express.Router();

// 📌 Fetch welcome content
router.get("/", async (req, res, next) => {
  try {
    // Mock data; in a real app, this could be fetched from a database
    const welcomeContent = {
      title: "Welcome to Hidden Spots",
      description:
        "Discover secret locations, hidden gems, and off-the-beaten-path destinations curated by travelers like you.",
      features: [
        {
          icon: "🗺️",
          title: "Explore Hidden Gems",
          description: "Find secret spots that aren't on typical tourist maps",
        },
        {
          icon: "🤖",
          title: "AI Travel Assistant",
          description: "Get personalized recommendations based on your preferences",
        },
        {
          icon: "👥",
          title: "Community Driven",
          description: "Share your own discoveries and connect with fellow explorers",
        },
      ],
    };
    res.status(200).json(welcomeContent);
  } catch (error) {
    next(error);
  }
});

module.exports = router;