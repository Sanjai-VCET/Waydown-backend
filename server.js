require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const winston = require("winston");
const connectDb = require("./config/db");
const cloudinary = require("./config/cloudinary");
const http = require("http");
const { Server } = require("socket.io");
const spotSocket = require("./sockets/spotSocket");
const authRoutes = require("./routes/authRoutes");
const spotRoutes = require("./routes/spotsRoute");
const userRoutes = require("./routes/usersRoute");
const welcomeRoute = require("./routes/welcomeRoute");
const interestsRoute = require("./routes/interestsRoute");
const communityRoutes = require("./routes/communityRoute");
const errorRoute = require("./routes/errorRoute");
const aiRoutes = require("./routes/aiRoutes");

// Clear module cache for routes
delete require.cache[require.resolve("./routes/authRoutes")];
delete require.cache[require.resolve("./routes/spotsRoute")];
delete require.cache[require.resolve("./routes/usersRoute")];

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

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

// In development, log to console too
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Connect to MongoDB
connectDb();

// Attach io to requests for controllers to use
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/spots", spotRoutes);
app.use("/api/users", userRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/errors", errorRoute);
app.use("/api/welcome", welcomeRoute);
app.use("/api/interests", interestsRoute);
app.use("/api/ai", aiRoutes);

// Socket.io setup
spotSocket(io);

// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });

  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});