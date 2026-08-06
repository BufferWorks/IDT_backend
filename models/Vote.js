// models/Vote.js
const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema(
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
    voterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

/**
 * One like per user per entry
 */
voteSchema.index({ voterId: 1, entryId: 1 }, { unique: true });

const VoteModel = mongoose.model("Vote", voteSchema);

mongoose.connection.once("open", () => {
  VoteModel.syncIndexes().catch(() => {});
});

module.exports = VoteModel;
