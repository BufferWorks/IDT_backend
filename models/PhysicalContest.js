const mongoose = require("mongoose");

const physicalContestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    bannerImage: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PhysicalContest", physicalContestSchema);
