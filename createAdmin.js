const admin = require("firebase-admin");
const mongoose = require("mongoose");
const User = require("./models/User");
require("./config/db"); // Connects to MongoDB
require("dotenv").config();

// Initialize Firebase Admin (assuming your service account is set)
const serviceAccount = require("./waydown-dbd87-4930f0814f25.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function createAdmin(email, password, username) {
  try {
    // Create user in Firebase
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: username,
    });
    console.log("Firebase user created:", userRecord.uid);

    // Sync to MongoDB with isAdmin: true
    let user = await User.findOne({ uid: userRecord.uid });
    if (!user) {
      user = new User({
        uid: userRecord.uid,
        email,
        username,
        profilePic: "",
        bio: "Admin of Hidden Tour Spot",
        followers: [],
        following: [],
        location: { type: "Point", coordinates: [0, 0] },
        interests: ["Adventure", "Nature"],
        notificationsEnabled: true,
        isAdmin: true // The magic bit
      });
      await user.save();
      console.log("Admin user created in MongoDB:", user._id);
    } else {
      await User.updateOne({ uid: userRecord.uid }, { $set: { isAdmin: true } });
      console.log("Existing user updated to admin in MongoDB");
    }

    // Output the UID and token for testing
    const token = await admin.auth().createCustomToken(userRecord.uid);
    console.log("Admin UID:", userRecord.uid);
    console.log("Custom Token (for testing):", token);

    mongoose.connection.close();
  } catch (error) {
    console.error("Fuckup detected:", error.message);
    mongoose.connection.close();
  }
}

// Run it with your desired admin creds
createAdmin("admin@hidden-tour-spot.com", "admin12345", "adminUser");