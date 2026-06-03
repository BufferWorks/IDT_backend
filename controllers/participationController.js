const { v4: uuidv4 } = require("uuid");
const Contest = require("../models/contest");
const ContestParticipation = require("../models/contestParticipation");
const User = require("../models/user");

// POST /api/contests/:contestID/register
exports.registerForContest = async (req, res) => {
  try {
    const { contestID } = req.params;
    const firebaseUID = req.firebaseUID;

    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    const contest = await Contest.findById(contestID);
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    // Check existing participation
    let participation = await ContestParticipation.findOne({
      userId: user._id,
      contestId: contest._id,
    });
    if (participation) {
      return res
        .status(200)
        .json({ message: "Already registered", participation });
    }

    // Create participation record
    // Note: For paid contests, the payment flow usually initiates participation
    // But if this is called first, we create it as pending payment.
    participation = await ContestParticipation.create({
      userId: user._id,
      contestId: contest._id,
      isPaid: contest.entryFee && contest.entryFee > 0 ? false : true,
      paymentAmount: contest.entryFee || 0,
      status:
        contest.entryFee && contest.entryFee > 0
          ? "PENDING_PAYMENT"
          : "REGISTERED",
    });

    // If no payment required, respond success
    if (!contest.entryFee || contest.entryFee === 0) {
      // Increment participant count for free contests
      await Contest.findByIdAndUpdate(contest._id, {
        $inc: { totalParticipants: 1 },
      });

      return res
        .status(201)
        .json({ message: "Registered (no payment required)", participation });
    }

    return res.status(201).json({
      message: "Registered - payment required",
      participation,
    });
  } catch (err) {
    console.error("registerForContest error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/:contestID/referral/:participationID
exports.getReferralLink = async (req, res) => {
  try {
    const { contestID, participationID } = req.params;

    // Optionally verify contest and participation exist
    const contest = await Contest.findById(contestID);
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    const participation = await ContestParticipation.findById(participationID).populate("userId");
    if (!participation)
      return res.status(404).json({ message: "Participation not found" });

    // Build a frontend referral link.
    const frontendBase = process.env.FRONTEND_URL || "https://idt.app"; // Updated to match app deep link scheme or web

    // Find entry for this participation
    const ContestyEntry = require("../models/contestEntry");
    const entry = await ContestyEntry.findOne({
      participationId: participation._id,
    });

    let referralUrl;
    if (entry) {
      if (entry.entryNumber && participation.userId && participation.userId.name) {
        const slug = participation.userId.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        referralUrl = `${frontendBase}/vote/${slug}-${entry.entryNumber}`;
      } else {
        referralUrl = `${frontendBase}/promote/${entry._id}`;
      }
    } else {
      // Fallback to contest page if no entry yet
      referralUrl = `${frontendBase}/contest/${contestID}`;
    }

    return res.status(200).json({ referralUrl });
  } catch (err) {
    console.error("getReferralLink error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
// GET /api/contests/my-participations
exports.getMyParticipations = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Find participations for this user, populate contest details
    const participations = await ContestParticipation.find({ userId: user._id })
      .populate("contestId")
      .sort({ createdAt: -1 });

    return res.status(200).json({ participations });
  } catch (err) {
    console.error("getMyParticipations error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET /api/contests/:contestID/participants
exports.getParticipants = async (req, res) => {
  try {
    const { contestID } = req.params;
    const ContestEntry = require("../models/contestEntry");

    // Find all valid (paid) participations for this contest
    const participations = await ContestParticipation.find({
      contestId: contestID,
      isPaid: true,
    })
      .populate("userId", "name profileImage email mobileNumber")
      .lean()
      .sort({ createdAt: -1 });

    const isAdmin = req.query.admin === 'true';

    // Enrichment Map
      const rawParticipantsWithEntries = await Promise.all(
      participations.map(async (p) => {
        const entryAny = await ContestEntry.findOne({ participationId: p._id })
          .select("_id images videoUrl entryNumber verificationStatus")
          .lean();
        
        // If not admin, completely exclude the participant if their entry is rejected
        if (!isAdmin && entryAny && entryAny.verificationStatus === 'REJECTED') {
           return null;
        }
        
        return {
          ...p,
          entryId: entryAny ? entryAny._id.toString() : null,
          hasEntry: !!entryAny,
          entryNumber: entryAny ? entryAny.entryNumber : null,
          entryThumbnail:
            entryAny && entryAny.images && entryAny.images.length > 0
              ? entryAny.images[0]
              : null,
          verificationStatus: entryAny ? (entryAny.verificationStatus || 'PENDING') : 'PENDING',
        };
      }),
    );
    
    const participantsWithEntries = rawParticipantsWithEntries.filter(p => p !== null);

    return res.status(200).json({ participants: participantsWithEntries });
  } catch (err) {
    console.error("getParticipants error", err);
    return res.status(500).json({ message: "Server error" });
  }
};
