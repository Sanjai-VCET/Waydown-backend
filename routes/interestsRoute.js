// interestsRoute.js
const express = require("express");
const router = express.Router();
const Spot = require("../models/Spot");


// ✅ Get interest options
router.get("/options", async (req, res) => {
  try {
    const tags = Spot.schema.path("tags").options.enum; // Get enum values from Spot model
    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Get interest categories (alias for /options)
router.get("/categories", async (req, res) => {
  try {
    const tags = Spot.schema.path("tags").options.enum;
    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
