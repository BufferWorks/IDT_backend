// models/ContestEntry.js
const mongoose = require("mongoose");

const contestEntrySchema = new mongoose.Schema(
  {
    participationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestParticipation",
      required: true,
      unique: true, // one entry per participation
    },
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
    entryNumber: {
      type: Number,
      unique: true,
      sparse: true,
    },

    images: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 3,
        message: "Maximum 3 images allowed",
      },
    },
    videoUrl: { type: String },
    bio: { type: String },

    isApproved: { type: Boolean, default: true }, // no approval flow for now
    verificationStatus: { 
      type: String, 
      enum: ['PENDING', 'VERIFIED', 'REJECTED'], 
      default: 'PENDING' 
    },
    submittedAt: { type: Date, default: () => new Date(Date.now() + 5.5 * 60 * 60 * 1000) },
    views: { type: Number, default: 0 },
  },
  { timestamps: { currentTime: () => new Date(Date.now() + 5.5 * 60 * 60 * 1000) } }
);

module.exports = mongoose.model("ContestEntry", contestEntrySchema);
