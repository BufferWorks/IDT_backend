const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const verifyFirebaseToken = require("../middlewares/firebaseAuth");

// Protected Routes
// ============================================================================
// 🌐 ENDPOINTS FOR WEB BASED PAYMENT (OLD FLOW)
// ============================================================================
// 1. App calls /initiate -> gets web URL -> redirects to browser
router.post(
  "/initiate",
  verifyFirebaseToken,
  paymentController.initiatePayment,
);

// 2. Web frontend calls /create-order to initialize Razorpay UI
router.post("/create-order", paymentController.createRazorpayOrder);

// 3. Web frontend calls /check-payment after successful checkout
router.post("/check-payment", paymentController.checkRazorpayPayment);


// ============================================================================
// 📱 ENDPOINTS FOR SDK PAYMENTS (NEW NATIVE FLOW)
// ============================================================================
// 1. App calls /initiate-native -> gets Razorpay Order ID directly
router.post(
  "/initiate-native",
  verifyFirebaseToken,
  paymentController.initiatePaymentNative,
);

// 2. App natively pays, then calls /verify-native to confirm
router.post(
  "/verify-native",
  verifyFirebaseToken,
  paymentController.verifyPaymentNative,
);


// ============================================================================
// 🔧 UTILITY & WEBHOOK ENDPOINTS
// ============================================================================
router.get("/status", paymentController.getPaymentStatus); 
router.post("/callback", paymentController.handleCallback); // Razorpay Webhook
router.get("/details/:paymentId", paymentController.getPaymentDetailsById);

module.exports = router;
