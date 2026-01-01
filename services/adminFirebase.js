// services/adminFirebase.js
const admin = require("firebase-admin");
const serviceAccount = require("../config/firebaseServiceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
