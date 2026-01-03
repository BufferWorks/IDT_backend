// models/ContestParticipation.js
const mongoose = require("mongoose");

const contestParticipationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
    },

    // PAYMENT
    isPaid: { type: Boolean, default: false },
    paymentId: { type: String },
    paymentAmount: { type: Number },
    paymentMethod: { type: String },
    paidAt: { type: Date },

    // STATUS
    status: {
      type: String,
      enum: ["REGISTERED", "SUBMITTED", "DISQUALIFIED"],
      default: "REGISTERED",
    },
  },
  { timestamps: true }
);

/**
 * One user can participate only once per contest
 */
contestParticipationSchema.index({ userId: 1, contestId: 1 }, { unique: true });

module.exports = mongoose.model(
  "ContestParticipation",
  contestParticipationSchema
);
