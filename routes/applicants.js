// routes/applicantRoutes.js
const express = require('express');
const router = express.Router();
const applicantController = require('../controllers/applicantController');
const authenticate = require('../middlewares/firebaseAuth');
const upload = require('../config/multer-config');

// Upload 3 images + 1 video
router.post('/apply',(req, res, next) => {
    req.folderName = 'IDT-MEDIA/applicants/media';
    next();
  },
  upload.fields([
    { name: 'images', maxCount: 3 },
    { name: 'video', maxCount: 1 },
  ]),
  authenticate,
  applicantController.applyToContest
);

module.exports = router;
