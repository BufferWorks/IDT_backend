// middleware/verifyFirebaseToken.js

const admin = require("../services/adminFirebase");

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ message: "Token missing" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUID = decoded.uid;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

module.exports = verifyFirebaseToken;
