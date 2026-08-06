const User = require('../models/user');
const { firebaseAuth } = require('../services/firebase');
const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
const generateOtp = require('../utils/otpGenerator');
const { saveOtp, verifyOtp, saveTempUser, getTempUser, deleteTempUser, setSignupVerifiedFlag, getSignupVerifiedFlag, deleteSignupVerifiedFlag } = require('../services/otpService');
const { sendOtp } = require('../services/fast2sms');
const jwt = require('jsonwebtoken');

// Helper to sanitize phone numbers
const normalizeMobile = (num) => {
  if (!num) return num;
  return num.toString().replace(/\s+/g, '').replace(/^\+91/, '');
};

// Helper to generate a unique referral code: IDT + 6 uppercase alphanumeric chars
const generateUniqueReferralCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let referralCode;
  let attempts = 0;
  do {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    referralCode = `IDT${suffix}`;
    const existing = await User.findOne({ referralCode });
    if (!existing) break;
    attempts++;
  } while (attempts < 5);
  return referralCode;
};

// ✅ Signup Controller (Step 1: Form Submission)
exports.signupInitiate = async (req, res) => {
  try {
    let { name, email, mobileNumber, age, gender, password } = req.body;
    mobileNumber = normalizeMobile(mobileNumber);

    const existingUser = await User.findOne({
      $or: [{ email }, { mobileNumber }],
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email or Mobile already exists' });
    }

    // const otp = generateOtp();
    const otp = generateOtp();
    // const otp = 1204; // Mock OTP disabled

    await saveOtp(mobileNumber, otp);

    // Save user details temporarily in Redis
    await saveTempUser(mobileNumber, name, email, age, gender, password);

    try {
      await sendOtp(mobileNumber, otp);
    } catch (error) {
      console.log("OTP Send Failed (API Blocked/Error). Proceeding with Mock OTP 1204.");
    }

    return res.status(200).json({ message: 'OTP sent for verification' });
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Signup initiation failed', error: error.message });
  }
};


// ✅ Verify OTP and create new user
exports.verifyOtp = async (req, res) => {
  let { mobileNumber, otp } = req.body;
  mobileNumber = normalizeMobile(mobileNumber);

  try {
    const isValid = await verifyOtp(mobileNumber, otp);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const tempData = await getTempUser(mobileNumber)
    if (!tempData) {
      return res.status(400).json({ message: 'No signup request found for this number' });
    }

    const { name, email, age, gender, password } = JSON.parse(tempData);

    // Create Firebase user
    const firebaseUser = await createUserWithEmailAndPassword(firebaseAuth, email, password);

    // Save user in MongoDB
    let user = await User.create({
      name,
      email,
      mobileNumber,
      age,
      gender,
      firebaseUID: firebaseUser.user.uid,
    });

    // Clean up Redis
    await deleteTempUser(mobileNumber)

    // Generate long-lived JWT (consistent across all login methods)
    const token = jwt.sign({ uid: firebaseUser.user.uid }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });
    const userObj = user.toObject();
    userObj.token = token;

    return res.status(200).json({ message: 'Registration successful', User: userObj, user: userObj });
  } catch (error) {
    return res.status(500).json({ message: 'OTP verification failed', error: error.message });
  }
};




// ✅ Login with Email/Password
exports.loginWithEmail = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sign in with Firebase
    const firebaseUser = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const firebaseUID = firebaseUser.user.uid;

    // Find user in your MongoDB
    const user = await User.findOne({ firebaseUID }).populate({
      path: 'winnings',
      populate: { path: 'contestId', select: 'name bannerImage' }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const token = jwt.sign({ uid: firebaseUID }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });
    const userObj = user.toObject();
    userObj.token = token;

    return res.status(200).json({
      message: "Login successful",
      user: userObj,
    });

  } catch (err) {
    console.error("❌ Login error:", err.message);
    return res.status(401).json({
      message: "Invalid credentials",
      error: err.message,
    });
  }
};




// ✅ Login with Mobile (OTP Step 1)
exports.mobileLogin = async (req, res) => {
  let { mobileNumber } = req.body;
  mobileNumber = normalizeMobile(mobileNumber);
  console.log(mobileNumber)
  const user = await User.findOne({ mobileNumber });

  if (!user) return res.status(404).json({ message: "User not found" });

  // const otp = generateOtp();
  const otp = generateOtp();
  // const otp = 1204;
  await saveOtp(mobileNumber, otp);
  try {
    await sendOtp(mobileNumber, otp);
  } catch (error) {
    console.log("OTP Send Failed (API Blocked/Error). Proceeding with Mock OTP 1204.");
  }

  return res.status(200).json({ message: "OTP sent to registered number" });
};






// ✅ Verify Mobile OTP (OTP Step 2)
exports.verifyMobileLoginOtp = async (req, res) => {
  let { mobileNumber, otp } = req.body;
  mobileNumber = normalizeMobile(mobileNumber);

  const isValid = await verifyOtp(mobileNumber, otp);
  if (!isValid) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  const user = await User.findOne({ mobileNumber }).populate({
    path: 'winnings',
    populate: { path: 'contestId', select: 'name bannerImage' }
  });
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Generate a fallback JWT since we can't get Firebase ID Token without password
  const token = jwt.sign({ uid: user.firebaseUID }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });
  const userObj = user.toObject();
  userObj.token = token;

  return res.status(200).json({ message: 'Login successful', user: userObj });
};


// route for adminlogin


exports.adminLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (email === 'idt@gmail.com' && password === 'abcd1234') {
      return res.status(200).json({ message: "Admin logged in Successfully", admin: { email: email, password: password } });
    } else {
      return res.status(401).json({ message: "Incorrect email or password" });
    }
  } catch (err) {
    return res.status(500).json({ message: "There is some error", error: err.message });
  }
};

const admin = require("../services/adminFirebase");

// ✅ Update Profile
// ✅ Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID; // From middleware

    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });

    let { name, age, gender, mobileNumber } = req.body;
    if (mobileNumber) mobileNumber = normalizeMobile(mobileNumber);

    let updateFields = {};
    if (name) updateFields.name = name;
    if (age) updateFields.age = age;
    if (gender) updateFields.gender = gender;
    if (mobileNumber) updateFields.mobileNumber = mobileNumber;

    // Check for uploaded file
    if (req.file && req.file.path) {
      updateFields.profileImage = req.file.path;
    }

    const user = await User.findOneAndUpdate(
      { firebaseUID },
      { $set: updateFields },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Optional: Update Firebase Display Name
    try {
      let firebaseUpdates = {};
      if (name) firebaseUpdates.displayName = name;
      if (updateFields.profileImage) firebaseUpdates.photoURL = updateFields.profileImage;

      if (Object.keys(firebaseUpdates).length > 0) {
        await admin.auth().updateUser(firebaseUID, firebaseUpdates);
      }
    } catch (e) {
      console.error('Firebase update failed (non-fatal)', e);
    }

    const userObj = user.toObject();
    return res.status(200).json({ message: 'Profile updated', user: userObj });

  } catch (err) {
    console.error('Update profile error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ Change Password
exports.changePassword = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    const { newPassword } = req.body;

    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Force update via Admin SDK
    await admin.auth().updateUser(firebaseUID, {
      password: newPassword,
    });

    return res.status(200).json({ message: 'Password updated successfully' });

  } catch (err) {
    console.error('Change password error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ Get Profile
exports.getProfile = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findOne({ firebaseUID }).populate({
      path: 'winnings',
      populate: { path: 'contestId', select: 'name bannerImage' }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ user });
  } catch (err) {
    console.error('Get profile error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "No token provided" });

    // Decode token ignoring expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret', { ignoreExpiration: true });
    
    // Find user to ensure they still exist and aren't deleted
    const user = await User.findOne({ firebaseUID: decoded.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate new 30-day token
    const newToken = jwt.sign({ uid: decoded.uid }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });

    return res.status(200).json({ token: newToken });
  } catch (err) {
    console.error("Refresh token error:", err.message);
    return res.status(403).json({ message: "Invalid token" });
  }
};

// ✅ New Signup Flow Step 1: Initiate Mobile
exports.signupInitiateMobile = async (req, res) => {
  try {
    let { mobileNumber } = req.body;
    mobileNumber = normalizeMobile(mobileNumber);

    if (!mobileNumber) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    const existingUser = await User.findOne({ mobileNumber });
    if (existingUser) {
      return res.status(409).json({ message: "Mobile number already registered. Please sign in.", redirect: "login" });
    }

    const otp = generateOtp();
    await saveOtp(mobileNumber, otp);

    try {
      await sendOtp(mobileNumber, otp);
    } catch (error) {
      console.log("OTP Send Failed. Proceeding with Mock OTP 1204.");
    }

    return res.status(200).json({ message: "OTP sent to your WhatsApp number" });
  } catch (err) {
    console.error("Signup initiate error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ New Signup Flow Step 2: Verify OTP
exports.verifySignupOtp = async (req, res) => {
  try {
    let { mobileNumber, otp } = req.body;
    mobileNumber = normalizeMobile(mobileNumber);

    const isValid = await verifyOtp(mobileNumber, otp);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Set a flag that this mobile is verified for signup (expires in 15 mins)
    await setSignupVerifiedFlag(mobileNumber);

    return res.status(200).json({ message: "OTP verified successfully. Proceed to details." });
  } catch (err) {
    console.error("Signup verify error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ New Signup Flow Step 3: Complete Signup
exports.completeSignup = async (req, res) => {
  try {
    let { name, email, mobileNumber, city, gender, password } = req.body;
    mobileNumber = normalizeMobile(mobileNumber);

    // Ensure the mobile number was verified
    const isVerified = await getSignupVerifiedFlag(mobileNumber);
    if (!isVerified) {
      return res.status(403).json({ message: "Session expired or mobile not verified. Please verify OTP again." });
    }

    // Create Firebase User
    const firebaseUser = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    
    // Create MongoDB User
    const user = await User.create({
      firebaseUID: firebaseUser.user.uid,
      name,
      email,
      mobileNumber,
      city,
      gender,
    });

    // Cleanup verified flag
    await deleteSignupVerifiedFlag(mobileNumber);

    // Generate and assign unique referral code
    try {
      const referralCode = await generateUniqueReferralCode();
      user.referralCode = referralCode;
      await user.save();
    } catch (refErr) {
      // Non-fatal — user is created, just without referral code yet
      console.error('Referral code generation failed (non-fatal):', refErr.message);
    }

    // Generate JWT
    const token = jwt.sign({ uid: firebaseUser.user.uid }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });
    const userObj = user.toObject();
    userObj.token = token;

    return res.status(201).json({
      message: "User registered successfully",
      user: userObj,
    });
  } catch (err) {
    console.error("Complete signup error:", err.message);
    if (err.code === 'auth/email-already-in-use') {
      return res.status(400).json({ message: "Email is already registered" });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Backfill referral code for existing users who signed up before this feature
// Called by the app on first load if user.referralCode is missing
exports.ensureReferralCode = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Already has a code — return it
    if (user.referralCode) {
      return res.status(200).json({ referralCode: user.referralCode });
    }

    // Generate one
    const referralCode = await generateUniqueReferralCode();
    user.referralCode = referralCode;
    await user.save();

    return res.status(200).json({ referralCode });
  } catch (err) {
    console.error('ensureReferralCode error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ Update FCM Token for Push Notifications
exports.updateFcmToken = async (req, res) => {
  try {
    const firebaseUID = req.firebaseUID;
    const { fcmToken } = req.body;

    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });
    if (!fcmToken) return res.status(400).json({ message: 'fcmToken required' });

    const user = await User.findOneAndUpdate(
      { firebaseUID },
      { fcmToken },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ message: 'FCM Token updated successfully', fcmToken: user.fcmToken });
  } catch (err) {
    console.error('updateFcmToken error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};