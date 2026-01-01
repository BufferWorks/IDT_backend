const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Applicant', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Voter
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true }, // Optional but useful
  createdAt: { type: Date, default: Date.now },
});

voteSchema.index({ applicant: 1, user: 1 }, { unique: true }); // Ensure 1 vote per user per applicant

module.exports = mongoose.model('Vote', voteSchema);
