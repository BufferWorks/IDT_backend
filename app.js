require("dotenv").config(); // ✅ MUST be first

const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const expressSession = require("express-session");

const connectDB = require("./database/connection");

const authRoute = require("./routes/auth");
const contestRoutes = require("./routes/contest.js");

const PORT = process.env.PORT || 6000;

// DB connection (non-blocking)
connectDB();

app.use(
  cors({
    origin: [
      "https://idteventmanagement.online",
      "https://www.idteventmanagement.online",
      "http://localhost:3000",
      "http://localhost:6001",
    ],
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
app.use("/api/payment", require("./routes/payment"));

app.get("/", (req, res) => {
  return res.json({ message: "pinging" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
