const Contest = require("../models/contest");

// POST /api/contest/create
// POST /api/contest/create
exports.createContest = async (req, res) => {
  try {
    const {
      name,
      theme,
      description,
      entryFee,
      prizePool,
      celebrityName,

      registrationStartAt,
      registrationEndAt,
      votingEndAt,
      winnersAnnouncedAt, // optional
      resultsAnnounceAt,
    } = req.body;

    if (
      !name ||
      !theme ||
      !description ||
      entryFee === undefined ||
      prizePool === undefined ||
      !registrationStartAt ||
      !registrationEndAt ||
      !votingEndAt
    ) {
      return res.status(400).json({
        message: "All required fields must be filled",
      });
    }

    const regStart = new Date(registrationStartAt);
    const regEnd = new Date(registrationEndAt);

    // Voting starts IMMEDIATELY when registration starts
    const voteStart = regStart;
    const voteEnd = new Date(votingEndAt);

    const winnersAnnounceDate = winnersAnnouncedAt
      ? new Date(winnersAnnouncedAt)
      : null;

    const resultsAnnounceDate = resultsAnnounceAt
      ? new Date(resultsAnnounceAt)
      : null;

    if (isNaN(regStart) || isNaN(regEnd) || isNaN(voteEnd)) {
      return res.status(400).json({
        message: "Invalid date format",
      });
    }

    if (regStart >= regEnd) {
      return res.status(400).json({
        message: "Registration end date must be after registration start date",
      });
    }

    if (voteEnd <= voteStart) {
      return res.status(400).json({
        message: "Voting end date must be after voting start date",
      });
    }

    // Registration CAN end before voting (allowed)
    if (regEnd > voteEnd) {
      return res.status(400).json({
        message: "Registration cannot end after voting ends",
      });
    }

    const imageUrl = req.file?.path;
    if (!imageUrl) {
      return res.status(400).json({
        message: "Banner image is required",
      });
    }

    const contest = new Contest({
      name,
      theme,
      description,
      entryFee,
      prizePool,
      celebrityName,

      bannerImage: imageUrl,

      registrationStartAt: regStart,
      registrationEndAt: regEnd,

      votingStartAt: voteStart,
      votingEndAt: voteEnd,

      winnersAnnounced: false,
      winnersAnnouncedAt: winnersAnnounceDate,
      resultsAnnounceAt: resultsAnnounceDate,

      isActive: true,
    });

    await contest.save();

    return res.status(201).json({
      message: "Contest created successfully",
      contest,
    });
  } catch (err) {
    console.error("Error creating contest:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// GET /api/contests/all
exports.getAllContests = async (req, res) => {
  try {
    const contests = await Contest.find().sort({ createdAt: -1 }); // latest first
    res.status(200).json({ contests });
  } catch (err) {
    console.error("Error fetching contests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/contest/:contestID
exports.getContestById = async (req, res) => {
  const contestId = req.params.contestID;
  try {
    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }
    return res
      .status(200)
      .json({ message: "Contest fetched successfully", contest });
  } catch (err) {
    console.error("Error fetching contest:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
