const Contest = require("../models/contest");
const ContestEntry = require("../models/contestEntry");
const ContestParticipation = require("../models/contestParticipation");
const User = require("../models/user");
const ContestWinner = require("../models/ContestWinner");
const { sendEntryUploadWhatsApp } = require("../services/fast2sms");

// POST /api/contests/:contestID/upload-entry
exports.uploadEntry = async (req, res) => {
  try {
    const { contestID } = req.params;
    const firebaseUID = req.firebaseUID;

    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    const contest = await Contest.findById(contestID);
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    const participation = await ContestParticipation.findOne({
      userId: user._id,
      contestId: contest._id,
    });
    if (!participation)
      return res
        .status(400)
        .json({ message: "User is not registered for this contest" });
    if (!participation.isPaid)
      return res.status(400).json({ message: "Payment not completed" });

    // Collect uploaded files
    const images = [];
    if (req.files && req.files["images"]) {
      for (const f of req.files["images"])
        images.push(f.path || f.location || f.secure_url || f.url);
    }

    let videoUrl = null;
    if (req.files && req.files["video"] && req.files["video"][0]) {
      const v = req.files["video"][0];
      videoUrl = v.path || v.location || v.secure_url || v.url;
    }

    const bio = req.body.bio || "";

    // Check if entry already exists (Upsert logic)
    let entry = await ContestEntry.findOne({
      participationId: participation._id,
    });

    if (entry) {
      // Update existing entry
      if (images.length > 0) entry.images = images;
      if (videoUrl) entry.videoUrl = videoUrl;
      if (bio) entry.bio = bio;
      entry.isApproved = true; // Auto-approve updates for now
      entry.submittedAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      await entry.save();
    } else {
      // Auto-increment entryNumber starting at 1000
      let newEntryNumber = 1000;
      const maxEntry = await ContestEntry.findOne().sort('-entryNumber').select('entryNumber');
      if (maxEntry && maxEntry.entryNumber) {
        newEntryNumber = maxEntry.entryNumber + 1;
      }

      // Create new entry
      entry = await ContestEntry.create({
        participationId: participation._id,
        userId: user._id,
        contestId: contest._id,
        entryNumber: newEntryNumber,
        images,
        videoUrl,
        bio,
        isApproved: true,
      });
    }

    // Update participation status
    participation.status = "SUBMITTED";
    await participation.save();

    // ── Fire-and-forget WhatsApp confirmation ────────────────────────────────
    try {
      const mobile = user.mobileNumber;
      if (mobile && entry.entryNumber) {
        const frontendBase = process.env.FRONTEND_URL || 'https://idteventmanagement.online';
        // Build slug from user's name: "John Doe" → "john-doe"
        const nameSlug = (user.name || 'user')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const votingUrl = `${frontendBase}/vote/${nameSlug}-${entry.entryNumber}`;
        // Non-blocking – don't await so endpoint responds immediately
        sendEntryUploadWhatsApp(mobile, entry.entryNumber, votingUrl);
      }
    } catch (notifyErr) {
      console.error('[uploadEntry] WhatsApp notify error (non-fatal):', notifyErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    return res.status(200).json({ message: "Entry submitted", entry });
  } catch (err) {
    console.error("uploadEntry error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/my-entries
exports.getMyEntries = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Find entries for this user
    const entries = await ContestEntry.find({ userId: user._id })
      .populate("contestId")
      .populate("userId", "name")
      .sort({ createdAt: -1 });

    const Vote = require("../models/Vote");
    const entriesWithVotes = await Promise.all(
      entries.map(async (e) => {
        const count = await Vote.countDocuments({ entryId: e._id });
        return { ...e.toObject(), totalVotes: count };
      }),
    );

    return res.status(200).json({ entries: entriesWithVotes });
  } catch (err) {
    console.error("getMyEntries error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/user/:userId/entries
exports.getUserEntries = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find entries for this specific user
    const entries = await ContestEntry.find({ userId })
      .populate("contestId")
      .sort({ createdAt: -1 });

    const Vote = require("../models/Vote");
    const entriesWithVotes = await Promise.all(
      entries.map(async (e) => {
        const count = await Vote.countDocuments({ entryId: e._id });
        return { ...e.toObject(), totalVotes: count };
      }),
    );

    return res.status(200).json({ entries: entriesWithVotes });
  } catch (err) {
    console.error("getUserEntries error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/entries/:entryId
exports.getEntryById = async (req, res) => {
  try {
    const { entryId } = req.params;

    // Support querying by raw ObjectId or numeric entryNumber
    const mongoose = require("mongoose");
    let query = {};
    if (mongoose.Types.ObjectId.isValid(entryId)) {
      query = { _id: entryId };
    } else {
      query = { entryNumber: parseInt(entryId, 10) };
    }

    const entry = await ContestEntry.findOneAndUpdate(
      query,
      { $inc: { views: 1 } },
      { new: true },
    )
      .populate("userId", "name profileImage")
      .populate("contestId", "name votingEndAt");
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    // Vote Logic
    let totalVotes = 0;
    try {
      const Vote = require("../models/Vote");
      totalVotes = await Vote.countDocuments({ entryId: entry._id });
    } catch (e) {
      console.error("Vote model error:", e);
    }

    let isVoted = false;
    let hasVotedInContest = false;
    let votedEntryDetails = null;

    // Safely check if user has voted
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];

        let admin;
        try {
          admin = require("../services/adminFirebase");
        } catch (e) {
          console.error("Admin require failed", e);
        }

        const jwt = require("jsonwebtoken");
        let decoded;

        if (admin && admin.auth) {
          try {
            decoded = await admin.auth().verifyIdToken(token);
          } catch (e) {
            console.error(
              "Firebase Token Verify Failed, trying JWT fallback:",
              e.message,
            );
            // FALLBACK for mobile/custom tokens
            try {
              decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || "dev-secret",
              );
            } catch (jwtErr) {
              console.error("JWT Fallback Failed:", jwtErr.message);
            }
          }

          if (decoded && (decoded.uid || decoded.user_id)) {
            const uid = decoded.uid || decoded.user_id;
            const user = await User.findOne({ firebaseUID: uid });
            if (user) {
              const contestObj = entry.contestId;
              const contestID =
                contestObj && contestObj._id ? contestObj._id : contestObj;

              if (contestID) {
                const Vote = require("../models/Vote");
                // Debug Log removed

                const vote = await Vote.findOne({
                  voterId: user._id,
                  contestId: contestID,
                });


                if (vote) {
                  hasVotedInContest = true;
                  if (vote.entryId.toString() === entry._id.toString()) {
                    isVoted = true;
                  } else {
                    // Fetch who they voted for
                    const votedEntry = await ContestEntry.findById(
                      vote.entryId,
                    ).populate("userId", "name");
                    if (votedEntry) {
                      votedEntryDetails = {
                        _id: votedEntry._id.toString(),
                        name: votedEntry.userId
                          ? votedEntry.userId.name
                          : "Unknown Candidate",
                        image:
                          votedEntry.images && votedEntry.images.length > 0
                            ? votedEntry.images[0]
                            : null,
                      };
                    }
                  }
                }
              }
            } else {
              console.log("[getEntryById] User not found via firebaseUID");
            }
          }
        } else {
          console.log("[getEntryById] Admin Auth service unavailable");
        }
      }
    } catch (e) {
      console.error("Auth check error in getEntryById", e);
    }

    const entryObj = entry.toObject();
    entryObj.totalVotes = totalVotes;
    entryObj.isVoted = isVoted;
    entryObj.hasVotedInContest = hasVotedInContest;
    entryObj.votedEntryDetails = votedEntryDetails;

    return res.status(200).json({ entry: entryObj });
  } catch (err) {
    console.error("getEntryById CRITICAL error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.toString() });
  }
};

// PATCH /api/contests/entries/:entryId/verification
exports.updateVerificationStatus = async (req, res) => {
  try {
    const { entryId } = req.params;
    const { status } = req.body; // 'PENDING', 'VERIFIED', 'REJECTED'

    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: "Invalid verification status" });
    }

    const entry = await ContestEntry.findById(entryId);
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    entry.verificationStatus = status;
    
    // Optionally: if rejected, you could clear out 'isApproved' too
    if (status === 'REJECTED') {
       entry.isApproved = false;
    } else {
       entry.isApproved = true;
    }

    await entry.save();

    return res.status(200).json({ 
      message: `Entry status updated to \${status}`,
      entry 
    });
  } catch (err) {
    console.error("updateVerificationStatus error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/entries/explore
exports.getExploreEntries = async (req, res) => {
  try {
    // Find all entries that have a videoUrl and are approved
    const entries = await ContestEntry.find({ 
      videoUrl: { $exists: true, $ne: null, $ne: "" },
      isApproved: true
    })
      .populate("userId", "name profileImage")
      .populate("contestId", "name");

    const Vote = require("../models/Vote");
    
    // Shuffle the array (Fisher-Yates)
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    // Optionally limit the number of entries returned to save bandwidth
    const limit = parseInt(req.query.limit) || 30;
    const selectedEntries = entries.slice(0, limit);

    const entriesWithVotes = await Promise.all(
      selectedEntries.map(async (e) => {
        const count = await Vote.countDocuments({ entryId: e._id });
        return { ...e.toObject(), totalVotes: count };
      })
    );

    return res.status(200).json({ entries: entriesWithVotes });
  } catch (err) {
    console.error("getExploreEntries error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/user-profile/:userId
exports.getPublicUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Get basic user info
    const user = await User.findById(userId).select("name bio profileImage");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Get all approved entries for this user
    const entries = await ContestEntry.find({ 
      userId, 
      isApproved: true 
    })
    .populate("contestId", "name bannerImage")
    .sort({ createdAt: -1 });

    // 3. Count unique contests
    const uniqueContests = new Set(entries.map(e => e.contestId?._id?.toString())).size;

    // 4. Get all wins for this user
    const wins = await ContestWinner.find({ userId })
      .populate("contestId", "name bannerImage")
      .populate("entryId", "images videoUrl entryThumbnail")
      .sort({ announcedAt: -1 });

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        bio: user.bio,
        profileImage: user.profileImage,
      },
      stats: {
        totalEntries: entries.length,
        totalContests: uniqueContests,
        totalWins: wins.length,
      },
      entries,
      wins,
    });
  } catch (err) {
    console.error("Error in getPublicUserProfile:", err);
    res.status(500).json({ message: "Server error fetching user profile" });
  }
};
