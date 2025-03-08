const admin = require("firebase-admin");
const winston = require("winston");

// Prevent duplicate initialization by checking if Firebase is already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require("../waydown-dbd87-4930f0814f25.json")
    ),
  });
}

// Export the Firebase instance to be used everywhere


module.exports = admin;