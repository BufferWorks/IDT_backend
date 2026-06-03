const express = require("express");
const router = express.Router();
const contestController = require("../controllers/contestController");
const upload = require("../config/multer-config");
const verifyFirebaseToken = require("../middlewares/firebaseAuth");
const participationController = require("../controllers/participationController");
const entryController = require("../controllers/entryController");
const voteController = require("../controllers/voteController");

// Static Routes (must come before /:contestID)
router.get("/user-profile/:userId", entryController.getPublicUserProfile);

router.post(
  "/create",
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/contests-banners";
    next();
  },
  upload.single("bannerImage"),
  contestController.createContest,
);

router.get("/all", contestController.getAllContests);
router.get("/my-entries", verifyFirebaseToken, entryController.getMyEntries);
router.get(
  "/my-participations",
  verifyFirebaseToken,
  participationController.getMyParticipations,
);
router.get(
  "/user/:userId/entries",
  verifyFirebaseToken,
  entryController.getUserEntries,
);

router.get("/entries/explore", entryController.getExploreEntries);
router.get("/entries/:entryId", entryController.getEntryById);
router.patch("/entries/:entryId/verification", entryController.updateVerificationStatus);

// Dynamic Routes
router.get("/:contestID", contestController.getContestById);
router.put(
  "/:contestID/update",
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/contests-banners";
    next();
  },
  upload.single("bannerImage"),
  contestController.updateContest
);

// Contest Actions
router.post(
  "/:contestID/register",
  verifyFirebaseToken,
  participationController.registerForContest,
);
router.post(
  "/:contestID/upload-entry",
  verifyFirebaseToken,
  (req, res, next) => {
    req.folderName = "IDT-MEDIA/contest-entries";
    next();
  },
  (req, res, next) => {
    upload.fields([
      { name: "images", maxCount: 3 },
      { name: "video", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        console.error("Upload Error:", err);
        return res
          .status(400)
          .json({ message: "File upload error", error: err.message });
      }
      next();
    });
  },
  entryController.uploadEntry,
);
router.post(
  "/:contestID/vote",
  verifyFirebaseToken,
  voteController.voteForEntry,
);
router.get(
  "/:contestID/referral/:participationID",
  participationController.getReferralLink,
);
router.get("/:contestID/participants", participationController.getParticipants);

// Bookmarks
const bookmarkController = require("../controllers/bookmarkController");
router.post(
  "/:contestId/bookmark",
  verifyFirebaseToken,
  bookmarkController.toggleBookmark,
);
router.get(
  "/user/bookmarks",
  verifyFirebaseToken,
  bookmarkController.getBookmarkedContests,
);

const winnerController = require("../controllers/winnerController");

// Winner Routes
router.get(
  "/:contestID/potential-winners",
  winnerController.getPotentialWinners,
);
router.post("/:contestID/publish-winners", winnerController.publishWinners);

module.exports = router;
