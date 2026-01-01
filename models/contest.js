const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  name: String,
  theme: String,
  description: String,
  entryFee: Number,
  celebrityName: String, // Optional
  prizePool: String,
  startDate: Date,
  endDate: Date,
  bannerImage: String, // Cloudinary URL
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Contest', contestSchema);
