require('dotenv').config();
const mongoose = require('mongoose');
const Referral = require('./models/Referral');
const User = require('./models/user');
const Contest = require('./models/contest');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("DB connected.");

    const referrals = await Referral.find({}).populate('referrerId refereeId contestId');
    console.log(`Total referrals in DB: ${referrals.length}`);
    referrals.forEach(r => {
      console.log(`- RefID: ${r._id}, Referrer: ${r.referrerId?.name} (${r.referrerId?.email}), Referee: ${r.refereeId?.name} (${r.refereeId?.email}), Contest: ${r.contestId?.name}, Status: ${r.status}, Earned: ₹${r.earnedAmount}`);
    });

    const users = await User.find({}).limit(5);
    console.log("\nSome Users in DB:");
    users.forEach(u => {
      console.log(`- ${u.name} (${u.email}) -> Code: ${u.referralCode}`);
    });

    const contests = await Contest.find({});
    console.log("\nContests in DB:");
    contests.forEach(c => {
      console.log(`- ${c.name} (ID: ${c._id}) -> Entry Fee: ₹${c.entryFee}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
