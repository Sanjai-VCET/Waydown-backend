const mongoose = require("mongoose");
const winston = require("winston");

// Setup Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const mongoUri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/hidden_spots";

const connectDb = async () => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s if server selection fails
      maxPoolSize: 10, // Maximum number of socket connections
      minPoolSize: 2, // Minimum number of socket connections
      connectTimeoutMS: 10000, // Timeout for initial connection
      socketTimeoutMS: 45000, // Timeout for socket inactivity
      retryWrites: true, // Retry failed writes
      w: "majority", // Write concern for better consistency
    });

    // Handle connection events
    mongoose.connection.on("connected", () => {
      logger.info("MongoDB connected successfully", { uri: mongoUri });
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected", { uri: mongoUri });
    });

    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error", {
        error: error.message,
        uri: mongoUri,
      });
    });

    logger.info("MongoDB connection established", { uri: mongoUri });
  } catch (error) {
    logger.error("Error connecting to MongoDB", {
      error: error.message,
      uri: mongoUri,
    });
    process.exit(1);
  }
};

module.exports = connectDb;
