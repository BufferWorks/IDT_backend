// middleware/verifyFirebaseToken.js

const admin = require("../services/adminFirebase");
const jwt = require("jsonwebtoken");

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ message: "Token missing" });

  try {
    // Try verifying as Custom JWT first (New default for all logins)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.firebaseUID = decoded.uid;
    next();
  } catch (err) {
    // Fallback: Try verifying as Firebase ID Token (for older sessions)
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.firebaseUID = decoded.uid;
      next();
    } catch (firebaseErr) {
      console.error("Token verification failed (JWT & Firebase):", err.message, firebaseErr.message);
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  }
};

module.exports = verifyFirebaseToken;
