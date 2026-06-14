const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const verifyFirebaseToken = require('../middlewares/firebaseAuth');

// Validate a referral code (user must be logged in)
router.post('/validate', verifyFirebaseToken, referralController.validateReferralCode);

// Get all referrals made by the logged-in user
router.get('/my-referrals', verifyFirebaseToken, referralController.getMyReferrals);

// Admin: Get all referrals (secured via x-admin-key header)
router.get('/admin/all', referralController.getAllReferrals);

module.exports = router;
