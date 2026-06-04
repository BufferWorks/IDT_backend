const PhysicalContest = require("../models/PhysicalContest");
const PhysicalContestEntry = require("../models/PhysicalContestEntry");

exports.createPhysicalContest = async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Contest name is required" });
    }

    const bannerImage = req.file?.path || req.file?.secure_url || req.file?.url || req.file?.location;
    if (!bannerImage) {
      return res.status(400).json({ message: "Banner image is required" });
    }

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const slug = `${baseSlug}-${randomSuffix}`;

    const contest = new PhysicalContest({
      name,
      bannerImage,
      slug,
    });

    await contest.save();

    return res.status(201).json({
      message: "Physical contest created successfully",
      contest,
    });
  } catch (err) {
    console.error("Error creating physical contest:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getPhysicalContests = async (req, res) => {
  try {
    const contests = await PhysicalContest.find().sort({ createdAt: -1 });
    res.status(200).json({ contests });
  } catch (err) {
    console.error("Error fetching physical contests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPhysicalContestById = async (req, res) => {
  try {
    const { id } = req.params;
    let contest;
    
    // Check if ID is a valid MongoDB ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      contest = await PhysicalContest.findById(id);
    } else {
      // Otherwise, it must be a slug
      contest = await PhysicalContest.findOne({ slug: id });
    }

    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }
    const count = await PhysicalContestEntry.countDocuments({ physicalContestId: contest._id });
    const year = new Date().getFullYear();
    const nextRegistrationNumber = `IDT-${year}-${String(count + 10001)}`;
    res.status(200).json({ contest, nextRegistrationNumber });
  } catch (err) {
    console.error("Error fetching physical contest:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.submitPhysicalEntry = async (req, res) => {
  try {
    const { id } = req.params;
    let contest;
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      contest = await PhysicalContest.findById(id);
    } else {
      contest = await PhysicalContest.findOne({ slug: id });
    }
    
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    const {
      participantName,
      fatherName,
      dob,
      age,
      gender,
      qualification,
      email,
      address,
      registrationNo,
      contactNumber,
      whatsappNumber,
      categories // Expected to be stringified array or array
    } = req.body;

    let parsedCategories = categories;
    if (typeof categories === 'string') {
      try {
        parsedCategories = JSON.parse(categories);
      } catch (e) {
        parsedCategories = categories.split(',').map(c => c.trim());
      }
    }

    if (!req.files || !req.files["passportPhoto"] || !req.files["paymentScreenshot"]) {
      return res.status(400).json({ message: "Passport photo and payment screenshot are required" });
    }

    const passportPhotoFile = req.files["passportPhoto"][0];
    const paymentScreenshotFile = req.files["paymentScreenshot"][0];

    const passportPhoto = passportPhotoFile.path || passportPhotoFile.secure_url || passportPhotoFile.url || passportPhotoFile.location;
    const paymentScreenshot = paymentScreenshotFile.path || paymentScreenshotFile.secure_url || paymentScreenshotFile.url || paymentScreenshotFile.location;

    const count = await PhysicalContestEntry.countDocuments({ physicalContestId: contest._id });
    const year = new Date().getFullYear();
    const autoRegNo = `IDT-${year}-${String(count + 10001)}`;

    const entry = new PhysicalContestEntry({
      physicalContestId: contest._id,
      participantName,
      fatherName,
      dob,
      age,
      gender,
      qualification,
      email,
      address,
      registrationNo: autoRegNo,
      contactNumber,
      whatsappNumber,
      categories: parsedCategories,
      passportPhoto,
      paymentScreenshot,
    });

    await entry.save();

    return res.status(201).json({ message: "Registration submitted successfully", entry });
  } catch (err) {
    console.error("Error submitting entry:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getEntriesByContest = async (req, res) => {
  try {
    const { id } = req.params;
    let contest;
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      contest = await PhysicalContest.findById(id);
    } else {
      contest = await PhysicalContest.findOne({ slug: id });
    }

    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    const entries = await PhysicalContestEntry.find({ physicalContestId: contest._id }).sort({ createdAt: -1 });
    
    res.status(200).json({ entries });
  } catch (err) {
    console.error("Error fetching entries:", err);
    res.status(500).json({ message: "Server error" });
  }
};
