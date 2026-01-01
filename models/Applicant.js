const mongoose = require('mongoose');

const applicantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true },
  images: {
    type: [String], // Max 3
    validate: [arrayLimit, '{PATH} exceeds limit of 3']
  },
  video: String, // Cloudinary video URL
  bio: String,
  isVerified: { type: Boolean, default: true }, // auto true
  isPaid: { type: Boolean, default: false }, // Set true after payment
  paymentDetails: {
    paymentId: String,
    amount: Number,
    method: String,
    date: Date
  },
}, {
  timestamps: true,
});

function arrayLimit(val) {
  return val.length <= 3;
}

module.exports = mongoose.model('Applicant', applicantSchema);
