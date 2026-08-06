const Vote = require('../models/Vote');
const Contest = require('../models/contest');
const ContestEntry = require('../models/contestEntry');
const User = require('../models/user');

// POST /api/contests/:contestID/vote (Toggle Like / Unlike)
exports.voteForEntry = async (req, res) => {
  try {
    const { contestID } = req.params;
    const { entryId } = req.body;
    const firebaseUID = req.firebaseUID;

    if (!firebaseUID) return res.status(401).json({ message: 'Unauthorized' });
    if (!entryId) return res.status(400).json({ message: 'entryId required' });

    const user = await User.findOne({ firebaseUID });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const contest = await Contest.findById(contestID);
    if (!contest) return res.status(404).json({ message: 'Contest not found' });

    // Enforce voting/liking end time guard
    if (contest.votingEndAt) {
      const endAtStr = contest.votingEndAt.toString();
      const cleaned = endAtStr.replace(/\+00:00$|\+0000$|Z$/, "");
      const endAtLocal = new Date(cleaned);
      const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      if (nowIST > endAtLocal) {
        return res.status(400).json({ message: 'Liking phase has ended for this contest.' });
      }
    }

    const mongoose = require('mongoose');
    let entry;
    if (mongoose.Types.ObjectId.isValid(entryId)) {
      entry = await ContestEntry.findById(entryId);
    } else {
      entry = await ContestEntry.findOne({ entryNumber: parseInt(entryId, 10) });
    }
    if (!entry) return res.status(404).json({ message: 'Entry not found' });

    // Check if user has already liked THIS entry
    const existing = await Vote.findOne({ voterId: user._id, entryId: entry._id });

    if (existing) {
      // UNLIKE: Remove like
      await Vote.findByIdAndDelete(existing._id);
      await Contest.findByIdAndUpdate(contest._id, { $inc: { totalVotes: -1 } });
      const currentLikes = await Vote.countDocuments({ entryId: entry._id });

      return res.status(200).json({
        message: 'Unliked entry',
        isLiked: false,
        totalLikes: currentLikes,
      });
    } else {
      // LIKE: Add like
      const vote = await Vote.create({
        contestId: contest._id,
        entryId: entry._id,
        voterId: user._id,
      });
      await Contest.findByIdAndUpdate(contest._id, { $inc: { totalVotes: 1 } });
      const currentLikes = await Vote.countDocuments({ entryId: entry._id });

      // Send Instant FCM Push Notification to Entry Owner asynchronously
      (async () => {
        try {
          const entryWithOwner = await ContestEntry.findById(entry._id).populate('userId', 'name fcmToken');
          if (
            entryWithOwner &&
            entryWithOwner.userId &&
            entryWithOwner.userId.fcmToken &&
            String(entryWithOwner.userId._id) !== String(user._id)
          ) {
            const admin = require('../services/adminFirebase');
            const likerName = user.name || 'Someone';
            const contestName = contest.name || 'Contest';

            await admin.messaging().send({
              token: entryWithOwner.userId.fcmToken,
              notification: {
                title: 'New Like! ❤️',
                body: `${likerName} liked your entry in ${contestName}!`,
              },
              android: {
                priority: 'high',
                notification: {
                  sound: 'default',
                  channelId: 'high_importance_channel',
                  clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
              },
              data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                entryId: entry._id.toString(),
                type: 'LIKE',
              },
            });
            console.log(`[FCM Notification] Sent like alert to ${entryWithOwner.userId.name}`);
          }
        } catch (fcmErr) {
          console.error('[FCM Notification] Like notification error:', fcmErr.message);
        }
      })();

      return res.status(201).json({
        message: 'Liked entry',
        isLiked: true,
        totalLikes: currentLikes,
        vote,
      });
    }
  } catch (err) {
    console.error('voteForEntry error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
