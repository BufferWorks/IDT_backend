require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const generateUniqueReferralCode = async (assignedCodes) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let referralCode;
  let attempts = 0;
  
  while (attempts < 100) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    referralCode = `IDT${suffix}`;
    
    // Check if it's already in the database
    const existingInDb = await User.findOne({ referralCode });
    // Also check if we already assigned it in this run/batch
    const existingInBatch = assignedCodes.has(referralCode);
    
    if (!existingInDb && !existingInBatch) {
      return referralCode;
    }
    attempts++;
  }
  throw new Error('Could not generate a unique referral code after 100 attempts');
};

const run = async () => {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Database connected successfully.");

    // Query all users where referralCode is missing, null, or empty string
    const query = {
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: "" }
      ]
    };

    const users = await User.find(query);
    console.log(`Found ${users.length} users without referral codes.`);

    if (users.length === 0) {
      console.log("All users already have referral codes. Nothing to do.");
      process.exit(0);
    }

    const assignedCodes = new Set();
    let successCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        const code = await generateUniqueReferralCode(assignedCodes);
        assignedCodes.add(code);
        
        await User.updateOne({ _id: user._id }, { $set: { referralCode: code } });
        
        successCount++;
        console.log(`[${successCount}/${users.length}] Assigned ${code} to user ${user.name} (${user.email})`);
      } catch (err) {
        console.error(`Failed to assign referral code to user ${user._id}: ${err.message}`);
      }
    }

    console.log(`Migration completed successfully. Backfilled ${successCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration script failed with error:", error);
    process.exit(1);
  }
};

run();
