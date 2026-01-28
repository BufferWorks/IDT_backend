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
      // If not paid, allow retry
      if (!participation.isPaid && contest.entryFee && contest.entryFee > 0) {
        const baseUrl = process.env.BACKEND_URL || "http://localhost:3000";
        const phonePeDemoUrl = `${baseUrl}/api/contests/pay-demo?participationId=${participation._id}&amount=${contest.entryFee}`;
        return res.status(200).json({
          message: "Already registered - Payment Pending",
          participation,
          paymentUrl: phonePeDemoUrl,
        });
      }
      // return existing participation with payment info
      return res
        .status(200)
        .json({ message: "Already registered", participation });
    }

    // Create participation record
    const paymentId = uuidv4();
    participation = await ContestParticipation.create({
      userId: user._id,
      contestId: contest._id,
      isPaid: contest.entryFee && contest.entryFee > 0 ? false : true,
      paymentId:
        contest.entryFee && contest.entryFee > 0 ? paymentId : undefined,
      paymentAmount: contest.entryFee || 0,
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

    // Otherwise return a mock PhonePe demo URL that the frontend can open
    // We direct them to our own backend demo page
    const baseUrl = process.env.BACKEND_URL || "http://localhost:3000";
    const phonePeDemoUrl = `${baseUrl}/api/contests/pay-demo?participationId=${participation._id}&amount=${contest.entryFee}`;

    return res.status(201).json({
      message: "Registered - payment required",
      participation,
      paymentUrl: phonePeDemoUrl,
    });
  } catch (err) {
    console.error("registerForContest error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST /api/contests/payment-callback
// Expects: { paymentId, status }
exports.paymentCallback = async (req, res) => {
  try {
    const { paymentId, status } = req.body;
    if (!paymentId)
      return res.status(400).json({ message: "paymentId required" });

    const participation = await ContestParticipation.findOne({ paymentId });
    if (!participation)
      return res.status(404).json({ message: "Participation not found" });

    if (status === "SUCCESS" || status === "COMPLETED") {
      participation.isPaid = true;
      participation.paidAt = new Date();
      participation.status = "REGISTERED";
      await participation.save();

      // increment contest totalParticipants if needed
      await Contest.findByIdAndUpdate(participation.contestId, {
        $inc: { totalParticipants: 1 },
      });

      return res
        .status(200)
        .json({ message: "Payment recorded", participation });
    }

    // For other statuses just record and return
    participation.paymentStatus = status;
    await participation.save();
    return res
      .status(200)
      .json({ message: "Payment status updated", participation });
  } catch (err) {
    console.error("paymentCallback error", err);
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

    const participation = await ContestParticipation.findById(participationID);
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
      referralUrl = `${frontendBase}/vote-demo?entryId=${entry._id}`;
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

    // Enrich with Entry ID
    const participantsWithEntries = await Promise.all(
      participations.map(async (p) => {
        const entry = await ContestEntry.findOne({
          participationId: p._id,
        }).select("_id images videoUrl");
        return {
          ...p,
          entryId: entry ? entry._id : null,
          entryThumbnail:
            entry && entry.images && entry.images.length > 0
              ? entry.images[0]
              : null,
        };
      }),
    );

    return res.status(200).json({ participants: participantsWithEntries });
  } catch (err) {
    console.error("getParticipants error", err);
    return res.status(500).json({ message: "Server error" });
  }
};
