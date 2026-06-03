const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Signup (Step 1: form submit → Firebase + Mongo + send OTP)
router.post('/signup-initiate', authController.signupInitiate);

// OTP Verification for Signup (Step 2)
router.post('/verify-otp', authController.verifyOtp);

// Email + Password Login via Firebase
router.post('/login', authController.loginWithEmail);

// Mobile Login (Step 1: send OTP)
router.post('/mobile-login', authController.mobileLogin);

// Mobile Login (Step 2: verify OTP)
router.post('/verify-mobile-login', authController.verifyMobileLoginOtp);

// Auto Refresh Token
router.post('/refresh-token', authController.refreshToken);

// New 3-Step Signup Flow
router.post('/signup-initiate-mobile', authController.signupInitiateMobile);
router.post('/verify-signup-otp', authController.verifySignupOtp);
router.post('/complete-signup', authController.completeSignup);

const verifyFirebaseToken = require('../middlewares/firebaseAuth');
const upload = require('../config/multer-config');

// Middleware to set folder
const setProfileFolder = (req, res, next) => {
    req.folderName = 'IDT-MEDIA/profiles';
    next();
};

router.get('/profile', verifyFirebaseToken, authController.getProfile);
router.put('/profile', verifyFirebaseToken, setProfileFolder, upload.single('profileImage'), authController.updateProfile);
router.post('/change-password', verifyFirebaseToken, authController.changePassword);

router.post('/admin-login', authController.adminLogin)

module.exports = router;
