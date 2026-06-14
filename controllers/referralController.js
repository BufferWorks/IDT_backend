const Referral = require('../models/Referral');
const User = require('../models/user');

// ============================================================
// POST /api/referral/validate
// Validates a referral code before submission
// Auth: User token required
// ============================================================
exports.validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const firebaseUID = req.firebaseUID;

    if (!referralCode) {
      return res.status(400).json({ valid: false, message: 'Referral code is required' });
    }

    // Find referrer by code
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });

    if (!referrer) {
      return res.status(404).json({ valid: false, message: 'Invalid referral code. Please check and try again.' });
    }

    // Find the requesting user
    const requestingUser = await User.findOne({ firebaseUID });
    if (!requestingUser) {
      return res.status(404).json({ valid: false, message: 'User not found' });
    }

    // Block self-referral
    if (referrer._id.toString() === requestingUser._id.toString()) {
      return res.status(400).json({ valid: false, message: 'You cannot use your own referral code.' });
    }

    return res.status(200).json({
      valid: true,
      referrerName: referrer.name,
      message: `✅ Valid! Referred by ${referrer.name}`,
    });
  } catch (err) {
    console.error('validateReferralCode error:', err.message);
    return res.status(500).json({ valid: false, message: 'Server error', error: err.message });
  }
};

// ============================================================
// GET /api/referral/my-referrals
// Returns all referrals made by the logged-in user
// Auth: User token required
// ============================================================
exports.getMyReferrals = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const referrals = await Referral.find({ referrerId: user._id })
      .populate('refereeId', 'name')
      .populate('contestId', 'name theme entryFee')
      .sort({ createdAt: -1 });

    // Summary stats
    const total = referrals.length;
    const pending = referrals.filter(r => r.status === 'PENDING').length;
    const completed = referrals.filter(r => r.status === 'COMPLETED').length;
    const totalEarned = referrals
      .filter(r => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + r.earnedAmount, 0);

    return res.status(200).json({
      referralCode: user.referralCode,
      stats: { total, pending, completed, totalEarned },
      referrals,
    });
  } catch (err) {
    console.error('getMyReferrals error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ============================================================
// GET /api/referral/admin/all
// Returns all referrals for admin dashboard
// Auth: ADMIN_SECRET_KEY header required
// ============================================================
exports.getAllReferrals = async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const referrals = await Referral.find({})
      .populate('referrerId', 'name mobileNumber')
      .populate('refereeId', 'name mobileNumber')
      .populate('contestId', 'name entryFee')
      .sort({ createdAt: -1 });

    const total = referrals.length;
    const pending = referrals.filter(r => r.status === 'PENDING').length;
    const completed = referrals.filter(r => r.status === 'COMPLETED').length;
    const totalEarningsOwed = referrals
      .filter(r => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + r.earnedAmount, 0);

    return res.status(200).json({
      stats: { total, pending, completed, totalEarningsOwed },
      referrals,
    });
  } catch (err) {
    console.error('getAllReferrals error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
