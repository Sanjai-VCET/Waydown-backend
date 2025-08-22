const admin = require("firebase-admin");
const winston = require("winston");

module.exports = (io) => {
  // Setup Winston logger (same config as server.js)
  const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
      }),
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

  // Authenticate Socket.io connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token; // Expect token from frontend
    if (!token) {
      logger.warn("Socket connection attempt without token");
      return next(new Error("Unauthorized"));
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      socket.user = decodedToken; // Attach user to socket
      next();
    } catch (error) {
      logger.error("Socket authentication error", { error: error.message });
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`User ${socket.user.uid} connected`, {
      userId: socket.user.uid,
    });

    // Join a user-specific room for follower notifications
    socket.on("joinUser", () => {
      socket.join(socket.user.uid); // Join a room based on Firebase UID
      logger.info(`User ${socket.user.uid} joined their own room`, {
        userId: socket.user.uid,
      });
    });

    // Leave the user-specific room (optional, usually on disconnect)
    socket.on("leaveUser", () => {
      socket.leave(socket.user.uid);
      logger.info(`User ${socket.user.uid} left their own room`, {
        userId: socket.user.uid,
      });
    });

    // Join a spot-specific room for spot updates
    socket.on("joinSpot", ({ spotId }) => {
      socket.join(spotId);
      logger.info(`User ${socket.user.uid} joined spot ${spotId}`, {
        userId: socket.user.uid,
        spotId,
      });
    });

    // Leave a spot-specific room
    socket.on("leaveSpot", ({ spotId }) => {
      socket.leave(spotId);
      logger.info(`User ${socket.user.uid} left spot ${spotId}`, {
        userId: socket.user.uid,
        spotId,
      });
    });

    socket.on("disconnect", () => {
      logger.info(`User ${socket.user.uid} disconnected`, {
        userId: socket.user.uid,
      });
    });
  });
};
