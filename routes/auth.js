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





router.post('/admin-login',authController.adminLogin)

module.exports = router;
