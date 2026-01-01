const Contest = require("../models/contest");

// POST /api/contest/create
exports.createContest = async (req, res) => {
  try {
    const {
      name,
      theme,
      description,
      entryFee,
      celebrityName,
      prizePool,
      startDate,
      endDate,
    } = req.body;

    if (
      !name ||
      !theme ||
      !description ||
      !entryFee ||
      !prizePool ||
      !startDate ||
      !endDate
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    const imageUrl = req.file?.path;
    if (!imageUrl) {
      return res.status(400).json({ message: "Banner image is required" });
    }

    const contest = new Contest({
      name,
      theme,
      description,
      entryFee,
      celebrityName,
      prizePool,
      startDate,
      endDate,
      bannerImage: imageUrl,
    });

    await contest.save();
    res.status(201).json({ message: "Contest created successfully", contest });
  } catch (err) {
    console.error("Error creating contest:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/contests/all
exports.getAllContests = async (req, res) => {
  try {
    const contests = await Contest.find().sort({ createdAt: -1 }); // latest first
    res.status(200).json({ contests });
  } catch (err) {
    console.error('Error fetching contests:', err);
    res.status(500).json({ message: 'Server error' });
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
    return res.status(200).json({ message: "Contest fetched successfully", contest });
  } catch (err) {
    console.error("Error fetching contest:", err);
    return res.status(500).json({ message: "Server error" });
  }
};