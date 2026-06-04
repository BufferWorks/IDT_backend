const express = require("express");
const router = express.Router();
const physicalContestController = require("../controllers/physicalContestController");
const upload = require("../config/multer-config");

// Admin create physical contest
router.post(
  "/create",
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/physical-contests";
    next();
  },
  upload.single("bannerImage"),
  physicalContestController.createPhysicalContest
);

// Get all physical contests
router.get("/all", physicalContestController.getPhysicalContests);

// Get a single physical contest by ID
router.get("/:id", physicalContestController.getPhysicalContestById);

// Submit a form for a physical contest
router.post(
  "/:id/submit",
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/physical-entries";
    next();
  },
  upload.fields([
    { name: "passportPhoto", maxCount: 1 },
    { name: "paymentScreenshot", maxCount: 1 },
  ]),
  physicalContestController.submitPhysicalEntry
);

// Admin get entries for a specific physical contest
router.get("/:id/entries", physicalContestController.getEntriesByContest);

module.exports = router;
