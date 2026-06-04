const mongoose = require("mongoose");

const physicalContestEntrySchema = new mongoose.Schema(
  {
    physicalContestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PhysicalContest",
      required: true,
    },
    participantName: {
      type: String,
      required: true,
    },
    fatherName: {
      type: String,
      required: true,
    },
    dob: {
      type: String, // String like 'YYYY-MM-DD' is fine for form inputs
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    gender: {
      type: String,
      required: true,
    },
    qualification: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    registrationNo: {
      type: String,
      required: true,
    },
    contactNumber: {
      type: String,
      required: true,
    },
    whatsappNumber: {
      type: String,
      required: true,
    },
    categories: {
      type: [String], // Array of strings since they can select multiple
      required: true,
    },
    passportPhoto: {
      type: String,
      required: true,
    },
    paymentScreenshot: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PhysicalContestEntry", physicalContestEntrySchema);
