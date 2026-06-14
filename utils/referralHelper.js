const Referral = require('../models/Referral');

/**
 * Called after any successful payment to complete any pending referral
 * for the given participation. This is fully idempotent — calling it multiple
 * times for the same participation is completely safe (extra calls do nothing).
 *
 * @param {ObjectId|string} participationId
 */
async function processReferralOnPaymentSuccess(participationId) {
  try {
    const referral = await Referral.findOne({
      participationId,
      status: 'PENDING',
    });

    if (!referral) {
      // No pending referral for this participation — nothing to do
      return;
    }

    referral.status = 'COMPLETED';
    referral.completedAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    await referral.save();

    console.log(
      `[Referral] ✅ Completed referral ${referral._id} | ` +
      `Referrer: ${referral.referrerId} | ` +
      `Earned: ₹${referral.earnedAmount} (snapshotted)`
    );
  } catch (err) {
    // This helper must NEVER crash the payment flow
    console.error('[Referral] Non-fatal error in processReferralOnPaymentSuccess:', err.message);
  }
}

module.exports = { processReferralOnPaymentSuccess };
