const User = require('../models/user');
const { firebaseAuth } = require('../services/firebase');
const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
const generateOtp = require('../utils/otpGenerator');
const { saveOtp, verifyOtp, saveTempUser, getTempUser, deleteTempUser } = require('../services/otpService');
const sendOtp = require('../services/fast2sms');

// ✅ Signup Controller (Step 1: Form Submission)
exports.signupInitiate = async (req, res) => {
  try {
    const { name, email, mobileNumber, age, gender, password } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { mobileNumber }],
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email or Mobile already exists' });
    }

    // const otp = generateOtp();
    const otp=1204;
    await saveOtp(mobileNumber, otp);

    // Save user details temporarily in Redis
    await saveTempUser(mobileNumber, name, email, age, gender, password);

    // await sendOtp(mobileNumber, otp);

    return res.status(200).json({ message: 'OTP sent for verification' });
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Signup initiation failed', error: error.message });
  }
};


// ✅ Verify OTP and create new user
exports.verifyOtp = async (req, res) => {
  const { mobileNumber, otp } = req.body;

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
    let user=await User.create({
      name,
      email,
      mobileNumber,
      age,
      gender,
      firebaseUID: firebaseUser.user.uid,
    });

    // Clean up Redis
    await deleteTempUser(mobileNumber)

    return res.status(200).json({ message: 'Registration successful',user: user});
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
    const user = await User.findOne({ firebaseUID });

    if (!user) {
      return res.status(404).json({ message: "User not found in database" });
    }

    return res.status(200).json({
      message: "Login successful",
      user,
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
  const { mobileNumber } = req.body;
  console.log(mobileNumber)
  const user = await User.findOne({ mobileNumber });

  if (!user) return res.status(404).json({ message: "User not found" });

  // const otp = generateOtp();
  const otp=1204;
  await saveOtp(mobileNumber, otp);
  // await sendOtp(mobileNumber, otp);

  return res.status(200).json({ message: "OTP sent to registered number" });
};




// ✅ Verify Mobile OTP (OTP Step 2)
exports.verifyMobileLoginOtp = async (req, res) => {
  const { mobileNumber, otp } = req.body;

  const isValid = await verifyOtp(mobileNumber, otp);
  if (!isValid) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  const user = await User.findOne({ mobileNumber });
  if (!user) return res.status(404).json({ message: 'User not found' });

  return res.status(200).json({ message: 'Login successful', user });
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