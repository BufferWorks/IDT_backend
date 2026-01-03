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
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContestEntry", contestEntrySchema);
