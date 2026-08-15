// jobs/dailyScoreJob.js
// tzchat 프로젝트 - 일일 집계/점수 산출 잡
// - 매일 11:00 KST 실행 가정(크론 또는 외부 스케줄러)
// - 필요시 애플리케이션 부팅 시 initDailyScoreCron() 호출

const cron = require('node-cron');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(tz);

const mongoose = require('mongoose');
const User = mongoose.model('User');
const Message = mongoose.model('Message');
const FriendRequest = mongoose.model('FriendRequest');

const UserDailyAgg = require('../models/System/UserDailyAgg');
const UserDailyScore = require('../models/System/UserDailyScore');
const { calcActivityScore, composeExposureScore, recencyWeightFrom } = require('../utils/score/scoreUtils');

const KST = 'Asia/Seoul';

function kstYmd(date) {
  return dayjs(date).tz(KST).format('YYYY-MM-DD');
}

async function computeAggForDay(ymd) {
  const dayStart = dayjs.tz(`${ymd} 00:00:00`, KST).toDate();
  const dayEnd = dayjs.tz(`${ymd} 23:59:59.999`, KST).toDate();

  // 사용자 목록(활성 사용자 위주로 제한 가능)
  const users = await User.find({ isDeleted: { $ne: true } }, { _id: 1 }).lean();

  // 메시지 전송 수 (보낸 기준)
  const msgAgg = await Message.aggregate([
    { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
    { $group: { _id: '$sender', cnt: { $sum: 1 } } },
  ]);

  const msgSentMap = new Map(msgAgg.map(a => [String(a._id), a.cnt]));

  // 친구 요청: 보냄/받음/수락
  const frSentAgg = await FriendRequest.aggregate([
    { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
    { $group: { _id: '$from', cnt: { $sum: 1 } } },
  ]);
  const frRecvAgg = await FriendRequest.aggregate([
    { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
    { $group: { _id: '$to', cnt: { $sum: 1 } } },
  ]);
  const frAcceptedAgg = await FriendRequest.aggregate([
    { $match: { acceptedAt: { $gte: dayStart, $lte: dayEnd }, status: 'accepted' } },
    { $group: { _id: '$to', cnt: { $sum: 1 } } }, // 수락은 to 기준(상대가 내 요청을 수락) / 서비스 규칙에 맞게 조정
  ]);

  const frSentMap = new Map(frSentAgg.map(a => [String(a._id), a.cnt]));
  const frRecvMap = new Map(frRecvAgg.map(a => [String(a._id), a.cnt]));
  const frAccMap = new Map(frAcceptedAgg.map(a => [String(a._id), a.cnt]));

  // TODO: blocksDone 집계가 필요하면 Block 모델/로그 기준으로 추가

  for (const u of users) {
    const uid = String(u._id);
    const aggDoc = {
      user: u._id,
      ymd,
      messagesSent: msgSentMap.get(uid) || 0,
      messagesRecv: 0, // 필요시 메시지 수신 추정 로직 추가
      friendReqSent: frSentMap.get(uid) || 0,
      friendReqRecv: frRecvMap.get(uid) || 0,
      friendReqAccepted: frAccMap.get(uid) || 0,
      blocksDone: 0,
    };

    await UserDailyAgg.updateOne(
      { user: u._id, ymd },
      { $set: aggDoc },
      { upsert: true }
    );
  }
}

async function computeScoreForDay(ymd) {
  const nowTs = Date.now();
  const aggs = await UserDailyAgg.find({ ymd }).lean();

  for (const a of aggs) {
    const weights = undefined; // 기본 가중 사용(필요시 사용자/세그먼트별 커스텀)
    const activityScore = calcActivityScore(a, weights);

    // 최근성: 해당 집계일의 끝 시간을 기준으로
    const recencyBase = dayjs.tz(`${ymd} 23:59:59`, KST).toDate();
    const recencyScore = recencyWeightFrom(recencyBase, nowTs);

    const exposureScore = composeExposureScore(activityScore, recencyScore);

    await UserDailyScore.updateOne(
      { user: a.user, ymd },
      {
        $set: {
          agg: {
            messagesSent: a.messagesSent,
            friendReqSent: a.friendReqSent,
            friendReqRecv: a.friendReqRecv,
            friendReqAccepted: a.friendReqAccepted,
            blocksDone: a.blocksDone,
          },
          activityScore,
          recencyScore,
          exposureScore,
        },
      },
      { upsert: true }
    );
  }
}

// 수동 실행용 엔트리
async function runDailyScoreJob(targetYmd) {
  const ymd = targetYmd || kstYmd(new Date());
  await computeAggForDay(ymd);
  await computeScoreForDay(ymd);
}

// 앱 부팅 시 스케줄 설정(매일 11:00 KST)
// 주: 인프라에서 이미 스케줄링한다면 이 함수 호출은 생략
function initDailyScoreCron() {
  // “0 11 * * *” = 매일 11:00
  cron.schedule('0 11 * * *', async () => {
    try {
      await runDailyScoreJob();
      // eslint-disable-next-line no-console
      console.log('[dailyScoreJob] done at 11:00 KST');
    } catch (e) {
      console.error('[dailyScoreJob] failed', e);
    }
  }, { timezone: KST });
}

module.exports = {
  runDailyScoreJob,
  initDailyScoreCron,
};
