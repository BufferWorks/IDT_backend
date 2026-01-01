// controllers/applicantController.js
const Applicant = require('../models/applicant');
const User = require('../models/user');

exports.applyToContest = async (req, res) => {
  try {
    const { contestId, bio } = req.body;
    const userFirebaseUID = req.firebaseUID;

    if (!contestId || !req.files || !req.files.images || !req.files.video) {
      return res.status(400).json({ message: 'All fields (images, video, contestId) are required.' });
    }

    if (req.files.images.length > 3) {
      return res.status(400).json({ message: 'Maximum 3 images allowed.' });
    }

    // Find user by Firebase UID
    const user = await User.findOne({ firebaseUID: userFirebaseUID });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Prevent duplicate application
    const existing = await Applicant.findOne({ userId: user._id, contestId });
    if (existing) {
      return res.status(400).json({ message: 'You have already applied to this contest.' });
    }

    // Extract Cloudinary URLs
    const imageUrls = req.files.images.map(file => file.path);
    const videoUrl = req.files.video[0].path;

    const applicant = new Applicant({
      userId: user._id,
      contestId,
      images: imageUrls,
      video: videoUrl,
      bio,
      isVerified: true,
      isPaid: false,
      paymentDetails: null,
    });

    await applicant.save();

    res.status(201).json({
      message: 'Application submitted successfully',
      applicantId: applicant._id,
    });
  } catch (err) {
    console.error('❌ Error in applyToContest:', err);
    res.status(500).json({ message: 'Server error while applying to contest' });
  }
};
