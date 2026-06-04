require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const expressSession = require("express-session");

const connectDB = require("./database/connection");

const authRoute = require("./routes/auth");
const contestRoutes = require("./routes/contest.js");
const paymentRoutes = require("./routes/payment");
const physicalContestRoutes = require("./routes/physicalContest");

const PORT = process.env.PORT || 6000;

// DB connection (non-blocking)
connectDB();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "https://idteventmanagement.online",
        "https://www.idteventmanagement.online",
        "http://idteventmanagement.online",
        "http://10.203.57.169:4000",
      ];

      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow allowed origins and any localhost
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.startsWith("http://localhost:")
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cookieParser());

app.use(
  expressSession({
    resave: false,
    saveUninitialized: false,
    secret: process.env.EXPRESS_SESSION_SECRET || "dev-secret",
  }),
);

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoute);
app.use("/api/contests", contestRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/physical-contests", physicalContestRoutes);
app.use("/api/deletion-requests", require("./routes/deletionRequest"));
app.use("/api/gallery", require("./routes/gallery"));
app.use("/api/notifications", require("./routes/notifications"));

app.get("/", (req, res) => {
  return res.json({ message: "pinging" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
