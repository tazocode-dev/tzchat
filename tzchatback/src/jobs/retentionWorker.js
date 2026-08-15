// jobs/retentionWorker.js
const cron = require('node-cron');
const mongoose = require('mongoose');
const retention = require('@/config/retention');
const { User, Message, ChatRoom, DeviceToken } = require('@/models');

// 매일 03:00 (KST)
cron.schedule(
  '0 3 * * *',
  async () => {
    const now = new Date();

    try {
      // 1) 삭제 유예 만료 계정 조회
      const toPurge = await User.find({
        status: 'pendingDeletion',
        deletionDueAt: { $lte: now },
      }).select('_id').lean();

      let purgedUsers = 0;

      // 2) 유저별 정리 (트랜잭션)
      for (const u of toPurge) {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();

          const userId = u._id;

          // 메시지 삭제 (정책에 따라 익명화로 바꿀 수 있음)
          await Message.deleteMany({ sender: userId }).session(session);

          // 채팅방 참가자 제거
          await ChatRoom.updateMany(
            { participants: userId },
            { $pull: { participants: userId } }
          ).session(session);

          // 참가자 0명 채팅방 삭제
          await ChatRoom.deleteMany({ participants: { $size: 0 } }).session(session);

          // 디바이스 토큰 삭제(세션성 데이터 포함 시 여기서 함께 처리)
          await DeviceToken.deleteMany({ userId }).session(session);

          // 최종 사용자 삭제
          const { deletedCount } = await User.deleteOne({ _id: userId }).session(session);
          purgedUsers += deletedCount ? 1 : 0;

          await session.commitTransaction();
          session.endSession();
        } catch (err) {
          await session.abortTransaction().catch(() => {});
          session.endSession();
          console.error('[retentionWorker] user purge error:', u._id, err?.message);
        }
      }

      // 3) 오래된 디바이스 토큰 일괄 정리
      const days = Number(retention.DEVICE_TOKEN_STALE_DAYS || 180);
      const staleThreshold = new Date(Date.now() - days * 86400000);

      const { deletedCount: purgedTokens } = await DeviceToken.deleteMany({
        lastSeenAt: { $lte: staleThreshold },
      });

      console.log(`[retentionWorker] ✅ purged users=${purgedUsers}, stale device tokens=${purgedTokens}`);
    } catch (e) {
      console.error('[retentionWorker] ❌ top-level error', e);
    }
  },
  { timezone: 'Asia/Seoul' }
);
