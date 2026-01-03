// const mongoose = require('mongoose');

// const contestSchema = new mongoose.Schema({
//   name: String,
//   theme: String,
//   description: String,
//   entryFee: Number,
//   celebrityName: String, // Optional
//   prizePool: String,
//   startDate: Date,
//   endDate: Date,
//   bannerImage: String, // Cloudinary URL
//   isActive: { type: Boolean, default: true },
// }, { timestamps: true });

// module.exports = mongoose.model('Contest', contestSchema);

const mongoose = require("mongoose");

const contestSchema = new mongoose.Schema(
  {
    // BASIC INFO
    name: {
      type: String,
      required: true,
      trim: true,
    },
    theme: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    bannerImage: {
      type: String,
      required: true, // Cloudinary URL
    },

    // FEES & PRIZES
    entryFee: {
      type: Number,
      required: true,
      min: 0,
    },
    prizePool: {
      type: Number,
      required: true,
      min: 0,
    },

    // OPTIONAL DISPLAY
    celebrityName: {
      type: String,
      trim: true,
    },

    // REGISTRATION PHASE
    registrationStartAt: {
      type: Date,
      required: true,
    },
    registrationEndAt: {
      type: Date,
      required: true,
    },

    // VOTING PHASE
    votingStartAt: {
      type: Date,
      required: true,
    },
    votingEndAt: {
      type: Date,
      required: true,
    },

    // RESULTS
    resultsAnnounceAt: {
      type: Date,
      required: true,
    },
    winnersAnnounced: {
      type: Boolean,
      default: false,
    },
    winnersAnnouncedAt: {
      type: Date,
    },

    // VISIBILITY / SYSTEM FLAGS
    isPublished: {
      type: Boolean,
      default: true, // visible to users
    },
    isArchived: {
      type: Boolean,
      default: false,
    },

    // DENORMALIZED STATS (FAST UI)
    totalParticipants: {
      type: Number,
      default: 0,
    },
    totalVotes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contest", contestSchema);
