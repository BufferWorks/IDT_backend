const { v4: uuidv4 } = require("uuid");
const Contest = require("../models/contest");
const ContestParticipation = require("../models/contestParticipation");
const Payment = require("../models/Payment");
const User = require("../models/user");
const razorpayService = require("../services/razorpayService");

// 1. Initiate Payment (Mobile App -> Backend)
// Returns a URL to the Frontend Checkout Page
exports.initiatePayment = async (req, res) => {
  try {
    const { contestId } = req.body;
    const firebaseUID = req.firebaseUID;

    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    const contest = await Contest.findById(contestId);
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    // Check if free
    if (!contest.entryFee || contest.entryFee === 0) {
      return res
        .status(400)
        .json({ message: "Free contest, use /register endpoint" });
    }

    // Check existing participation
    let participation = await ContestParticipation.findOne({
      userId: user._id,
      contestId: contest._id,
    });

    if (participation && participation.isPaid) {
      return res.status(200).json({ message: "Already paid", participation });
    }

    if (!participation) {
      participation = await ContestParticipation.create({
        userId: user._id,
        contestId: contest._id,
        isPaid: false,
        status: "REGISTERED",
        paymentAmount: contest.entryFee,
      });
    }

    // Create Internal Payment Record
    const merchantOrderId = `IDT_${uuidv4().split("-")[0]}_${Date.now()}`;

    const payment = await Payment.create({
      userId: user._id,
      contestId: contest._id,
      participationId: participation._id,
      merchantOrderId: merchantOrderId,
      amount: contest.entryFee,
      status: "INITIATED",
    });

    // Link payment to participation
    participation.paymentId = payment._id;
    await participation.save();

    // Construct Redirect URL to Frontend Checkout
    const frontendBaseUrl =
      process.env.PAYMENT_REDIRECT_BASE_URL ||
      "https://idteventmanagement.online";
    // We send the internal payment ID (referenceId) to the frontend
    const checkoutUrl = `${frontendBaseUrl}/checkout?contestId=${contest._id}&userId=${user._id}&referenceId=${payment._id}`;

    return res.status(200).json({
      success: true,
      redirectUrl: checkoutUrl, // Mobile App will open this
      merchantOrderId: merchantOrderId,
      paymentId: payment._id,
    });
  } catch (err) {
    console.error("initiatePayment Error:", err);
    return res
      .status(500)
      .json({ message: "Payment initiation failed", error: err.message });
  }
};

// 1.5. Initiate Native Payment (Mobile App SDK -> Backend)
exports.initiatePaymentNative = async (req, res) => {
  try {
    const { contestId } = req.body;
    const firebaseUID = req.firebaseUID;

    if (!firebaseUID) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: "User not found" });

    const contest = await Contest.findById(contestId);
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    if (!contest.entryFee || contest.entryFee === 0) {
      return res.status(400).json({ message: "Free contest, use /register endpoint" });
    }

    let participation = await ContestParticipation.findOne({
      userId: user._id,
      contestId: contest._id,
    });

    if (participation && participation.isPaid) {
      return res.status(200).json({ message: "Already paid", participation });
    }

    if (!participation) {
      participation = await ContestParticipation.create({
        userId: user._id,
        contestId: contest._id,
        isPaid: false,
        status: "REGISTERED",
        paymentAmount: contest.entryFee,
      });
    }

    const merchantOrderId = `IDT_${uuidv4().split("-")[0]}_${Date.now()}`;

    const payment = await Payment.create({
      userId: user._id,
      contestId: contest._id,
      participationId: participation._id,
      merchantOrderId: merchantOrderId,
      amount: contest.entryFee,
      status: "INITIATED",
    });

    participation.paymentId = payment._id;
    await participation.save();

    // Directly create Razorpay Order
    const order = await razorpayService.createOrder(
      payment.amount,
      "INR",
      payment.merchantOrderId,
      {
        userId: payment.userId.toString(),
        contestId: payment.contestId.toString(),
        merchantOrderId: payment.merchantOrderId,
      }
    );

    payment.razorpayOrderId = order.id;
    await payment.save();

    return res.status(200).json({
      success: true,
      key: razorpayService.getKeyId(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      user: {
        name: user.name || "User",
        email: user.email || "user@example.com",
        contact: user.mobileNumber || "",
      },
    });
  } catch (err) {
    console.error("initiatePaymentNative Error:", err);
    return res.status(500).json({ message: "Native payment initiation failed", error: err.message });
  }
};

// 2. Create Razorpay Order (Frontend -> Backend)
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { referenceId } = req.body; // Internal Payment ID
    if (!referenceId)
      return res.status(400).json({ message: "Reference ID required" });

    const payment = await Payment.findById(referenceId).populate("userId");
    if (!payment)
      return res.status(404).json({ message: "Payment record not found" });

    // Create Order on Razorpay
    const order = await razorpayService.createOrder(
      payment.amount,
      "INR",
      payment.merchantOrderId, // receipt
      {
        userId: payment.userId._id.toString(),
        contestId: payment.contestId.toString(),
        merchantOrderId: payment.merchantOrderId,
      },
    );

    // Update Payment with Razorpay Order ID
    payment.razorpayOrderId = order.id;
    await payment.save();

    return res.status(200).json({
      success: true,
      key: razorpayService.getKeyId(),
      order: order,
      user: {
        name: payment.userId.name || "User",
        email: payment.userId.email || "user@example.com",
        contact: payment.userId.mobile || "",
      },
    });
  } catch (err) {
    console.error("createRazorpayOrder Error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create Razorpay order", error: err.message });
  }
};

// 2.5 Verify Native SDK Payment
exports.verifyPaymentNative = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing Razorpay details" });
    }

    const isValid = razorpayService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    
    if (!isValid) {
      return res.status(400).json({ message: "Invalid Signature" });
    }

    let payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ message: "Internal payment record not found" });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = "SUCCESS";
    await payment.save();

    let participation = await ContestParticipation.findById(payment.participationId);
    if (participation && !participation.isPaid) {
      participation.isPaid = true;
      await participation.save();
    }

    return res.status(200).json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("verifyPaymentNative Error:", err);
    return res.status(500).json({ message: "Failed to verify native payment", error: err.message });
  }
};

// 3. Verify Payment (Frontend -> Backend)
// 3. Check Payment Status (Frontend -> Backend) - Replaces Signature Verification
exports.checkRazorpayPayment = async (req, res) => {
  try {
    const { paymentId } = req.body; // Razorpay Payment ID
    if (!paymentId)
      return res.status(400).json({ message: "Payment ID required" });

    // Fetch from Razorpay
    const paymentDetails = await razorpayService.fetchPayment(paymentId);

    if (!paymentDetails) {
      return res.status(404).json({ message: "Payment not found in Razorpay" });
    }

    // Find Internal Payment using Razorpay Order ID (linked during create order)
    const razorpayOrderId = paymentDetails.order_id;
    let payment = await Payment.findOne({ razorpayOrderId: razorpayOrderId });

    if (!payment) {
      // Fallback: Try finding by merchantOrderId if passed in notes
      if (paymentDetails.notes && paymentDetails.notes.merchantOrderId) {
        payment = await Payment.findOne({
          merchantOrderId: paymentDetails.notes.merchantOrderId,
        });
      }
    }

    if (!payment) {
      return res
        .status(404)
        .json({ message: "Internal Payment record not found" });
    }

    // Update Status based on Razorpay Status
    const status = paymentDetails.status;
    let internalStatus = "FAILED";

    if (status === "captured" || status === "authorized") {
      internalStatus = "SUCCESS";
    }

    // Update Payment Record
    payment.razorpayPaymentId = paymentId;
    payment.status = internalStatus;
    if (internalStatus === "SUCCESS") {
      payment.paidAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    }
    await payment.save();

    // Update Participation
    if (internalStatus === "SUCCESS") {
      await ContestParticipation.findByIdAndUpdate(payment.participationId, {
        isPaid: true,
        paidAt: new Date(Date.now() + 5.5 * 60 * 60 * 1000),
        paymentId: payment._id,
      });

      await Contest.findByIdAndUpdate(payment.contestId, {
        $inc: { totalParticipants: 1 },
      });
    }

    return res.status(200).json({
      success: internalStatus === "SUCCESS",
      status: internalStatus,
      contestId: payment.contestId,
      merchantOrderId: payment.merchantOrderId,
      paymentDetails: paymentDetails,
    });
  } catch (err) {
    console.error("checkRazorpayPayment Error:", err);
    return res
      .status(500)
      .json({ message: "Payment check failed", error: err.message });
  }
};

// 4. Get Payment Status (Optional / Status Check)
exports.getPaymentStatus = async (req, res) => {
  // Kept for backward compatibility or polling if needed
  try {
    const { merchantOrderId } = req.query;
    if (!merchantOrderId)
      return res.status(400).json({ message: "merchantOrderId required" });

    const payment = await Payment.findOne({ merchantOrderId }).populate(
      "contestId",
    );
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    return res.status(200).json({
      success: true,
      status: payment.status,
      contestId: payment.contestId._id,
    });
  } catch (err) {
    console.error("getPaymentStatus Error:", err);
    return res.status(500).json({ message: "Status check failed" });
  }
};

exports.getPaymentDetailsById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate("userId", "name email mobileNumber")
      .populate("contestId", "name theme entryFee");
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    return res.status(200).json({ payment });
  } catch (err) {
    console.error("getPaymentDetails Error:", err);
    return res.status(500).json({ message: "Failed to fetch payment details", error: err.message });
  }
};

exports.handleCallback = async (req, res) => {
  // Razorpay Webhooks can be handled here
  console.log("Razorpay Webhook:", req.body);
  res.status(200).send("OK");
};
