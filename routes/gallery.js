const express = require("express");
const router = express.Router();
const galleryController = require("../controllers/galleryController");
const upload = require("../config/multer-config");
const verifyFirebaseToken = require("../middlewares/firebaseAuth");

// GET /api/gallery (Public - Mobile app fetches this)
router.get("/", galleryController.getGallery);

// POST /api/gallery/upload (Admin only)
router.post(
  "/upload",
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/gallery";
    next();
  },
  upload.r2Upload.array("images", 20),
  galleryController.uploadImages
);

// DELETE /api/gallery/:id (Admin only)
router.delete("/:id", galleryController.deleteImage);

module.exports = router;
