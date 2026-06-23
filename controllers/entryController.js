const Contest = require("../models/contest");
const ContestEntry = require("../models/contestEntry");
const ContestParticipation = require("../models/contestParticipation");
const Referral = require("../models/Referral");
const User = require("../models/user");
const ContestWinner = require("../models/ContestWinner");
const { sendEntryUploadWhatsApp } = require("../services/fast2sms");
const cloudinary = require("cloudinary").v2;

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/r2-config");

exports.getUploadSignature = (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: "IDT-MEDIA/contest-entries" },
      process.env.CLOUDINARY_API_SECRET
    );
    res.status(200).json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate signature", error: error.message });
  }
};

exports.getPresignedUrl = async (req, res) => {
  try {
    const { filename, mimeType } = req.query;
    if (!filename || !mimeType) {
      return res.status(400).json({ message: "filename and mimeType are required query parameters" });
    }

    // Clean original name: replace non-alphanumeric chars (excluding dots/dashes) with underscores
    const cleanOriginalName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const ext = cleanOriginalName.split('.').pop().toLowerCase();
    
    // Auto-rewrite filename extension to .jpg for images so they align with compression output
    const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
    let finalKey = cleanOriginalName;
    if (isImage) {
      const baseName = cleanOriginalName.substring(0, cleanOriginalName.lastIndexOf('.')) || cleanOriginalName;
      finalKey = `${baseName}.jpg`;
    }

    const fileKey = `IDT-MEDIA/contest-entries/${Date.now()}-${finalKey}`;
    const contentType = isImage ? 'image/jpeg' : mimeType;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // Valid for 15 mins
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    res.status(200).json({
      uploadUrl,
      publicUrl,
    });
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL", error: error.message });
  }
};

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

    let participation = await ContestParticipation.findOne({
      userId: user._id,
      contestId: contest._id,
    });
    
    if (!participation) {
      participation = await ContestParticipation.create({
        userId: user._id,
        contestId: contest._id,
        isPaid: contest.entryFee && contest.entryFee > 0 ? false : true,
        paymentAmount: contest.entryFee || 0,
        status: "REGISTERED",
      });
    }

    // Collect uploaded files from Multipart (Legacy flow)
    const images = [];
    if (req.files && req.files["images"]) {
      for (const f of req.files["images"])
        images.push(f.path || f.location || f.secure_url || f.url);
    }
    // Collect uploaded files from JSON Body (New Signed URL flow)
    if (req.body.imageUrl && images.length === 0) {
      images.push(req.body.imageUrl);
    }

    let videoUrl = null;
    if (req.files && req.files["video"] && req.files["video"][0]) {
      const v = req.files["video"][0];
      videoUrl = v.path || v.location || v.secure_url || v.url;
    } else if (req.body.videoUrl) {
      videoUrl = req.body.videoUrl;
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
      if (req.body.videoThumbnail) entry.videoThumbnail = req.body.videoThumbnail;
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
        videoThumbnail: req.body.videoThumbnail || null,
        bio,
        isApproved: true,
      });
    }

    // Update participation status
    participation.status = "SUBMITTED";
    await participation.save();

    // ── Referral Tracking (non-blocking, never fails entry upload) ──
    const referralCode = req.body.referralCode;
    if (referralCode && contest.entryFee > 0) {
      (async () => {
        try {
          console.log(`[Referral Debug] Processing code: ${referralCode} for referee: ${user.name}`);
          const referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });
          if (!referrer) {
            console.log(`[Referral Debug] Referrer with code ${referralCode} not found in DB.`);
            return;
          }

          // Block self-referral
          if (referrer._id.toString() === user._id.toString()) {
            console.log(`[Referral Debug] Blocked self-referral for user ${user.name}.`);
            return;
          }

          // Prevent duplicate referral for same referee+contest combo
          const existingReferral = await Referral.findOne({
            refereeId: user._id,
            contestId: contest._id,
          });
          if (existingReferral) {
            console.log(`[Referral Debug] Duplicate referral detected for referee ${user.name} and contest ${contest.name}.`);
            return;
          }

          // Snapshot both amounts right now
          const percent = parseFloat(process.env.REFERRAL_PERCENT) || 30;
          const earnedAmount = parseFloat(((contest.entryFee * percent) / 100).toFixed(2));

          await Referral.create({
            referrerId: referrer._id,
            refereeId: user._id,
            contestId: contest._id,
            participationId: participation._id,
            referralCode: referralCode.toUpperCase().trim(),
            entryFee: contest.entryFee,
            earnedAmount,
            status: 'PENDING',
          });
          console.log(`[Referral] Created PENDING referral. Referrer: ${referrer.name}, Fee: ₹${contest.entryFee}, Earned: ₹${earnedAmount}`);
        } catch (refErr) {
          console.error('[Referral] Non-fatal error creating referral record:', refErr.message);
        }
      })();
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Fire-and-forget WhatsApp confirmation (Only if free or already paid) ──
    if (participation.isPaid) {
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
      .populate("participationId", "isPaid status paymentAmount")
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
    const rawEntries = await ContestEntry.find({ 
      videoUrl: { $exists: true, $ne: null, $ne: "" },
      isApproved: true
    })
      .populate("userId", "name profileImage")
      .populate("contestId", "name")
      .populate({
        path: "participationId",
        match: { isPaid: true }, // Only populate if the participation is paid
        select: "isPaid"
      });

    // Filter out entries where participation is unpaid (participationId will be null)
    const entries = rawEntries.filter(e => e.participationId != null);

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
