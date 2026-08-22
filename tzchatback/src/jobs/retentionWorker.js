const cron = require('node-cron');
const retention = require('@/config/retention');
const { User, DeviceToken } = require('@/models');
const { purgeExpiredUser } = require('@/services/system/accountPurgeService');

// 매일 03:00 (KST)
cron.schedule(
  '0 3 * * *',
  async () => {
    const now = new Date();

    try {
      const toPurge = await User.find({
        status: 'pendingDeletion',
        deletionDueAt: { $lte: now },
      }).select('_id').lean();

      let purgedUsers = 0;
      for (const user of toPurge) {
        try {
          const result = await purgeExpiredUser(user._id, { now });
          if (result.purged) purgedUsers += 1;
        } catch (error) {
          // User는 마지막에 삭제되므로 다음 실행에서 동일 작업을 안전하게 재시도한다.
          console.error('[retentionWorker] user purge error:', user._id, error?.message);
        }
      }

      const days = Number(retention.DEVICE_TOKEN_STALE_DAYS || 180);
      const staleThreshold = new Date(Date.now() - days * 86400000);
      const { deletedCount: purgedTokens } = await DeviceToken.deleteMany({
        lastSeenAt: { $lte: staleThreshold },
      });

      console.log(`[retentionWorker] ✅ purged users=${purgedUsers}, stale device tokens=${purgedTokens}`);
    } catch (error) {
      console.error('[retentionWorker] ❌ top-level error', error);
    }
  },
  { timezone: 'Asia/Seoul' }
);
