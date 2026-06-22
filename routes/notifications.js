const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

const upload = require('../config/multer-config');

// Middleware to protect routes with admin secret key
const requireAdminKey = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ message: 'Forbidden: Invalid admin key.' });
  }
  next();
};

// POST /api/notifications/send
router.post('/send', requireAdminKey, notificationController.sendNotification);

// POST /api/notifications/upload
// Set folderName for Cloudinary before passing to multer
router.post(
  '/upload',
  requireAdminKey,
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/notifications";
    next();
  },
  upload.r2Upload.single('image'),
  notificationController.uploadImage
);

module.exports = router;
