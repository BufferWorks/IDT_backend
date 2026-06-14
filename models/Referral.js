const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    refereeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contest',
      required: true,
    },
    participationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContestParticipation',
      required: true,
    },
    // Snapshot of which code was used (immutable record)
    referralCode: {
      type: String,
      required: true,
    },
    // Snapshot of contest entry fee at time of referral creation (never changes)
    entryFee: {
      type: Number,
      required: true,
    },
    // Snapshot of earned amount at time of referral creation (never recalculates)
    earnedAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: { currentTime: () => new Date(Date.now() + 5.5 * 60 * 60 * 1000) },
  }
);

// Index for fast lookups
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ participationId: 1 });
referralSchema.index({ refereeId: 1, contestId: 1 }); // for duplicate check

module.exports = mongoose.model('Referral', referralSchema);
