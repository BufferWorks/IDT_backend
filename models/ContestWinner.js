// models/ContestWinner.js
const mongoose = require("mongoose");

const contestWinnerSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
    },
    entryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestEntry",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    rank: {
      type: Number,
      enum: [1, 2, 3],
      required: true,
    },
    votesAtWinTime: {
      type: Number,
      required: true,
    },
    announcedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContestWinner", contestWinnerSchema);
