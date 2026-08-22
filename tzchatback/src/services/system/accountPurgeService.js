const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const models = require('@/models');

const DEFAULT_UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.resolve(__dirname, '../../../uploads');
const MOCK_MEMBERSHIP_STATUSES = ['mock_paid', 'mock_fail'];

class AccountPurgeError extends Error {}

function isSafeChildPath(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function uploadUrlToSafePath(value, uploadRoot = DEFAULT_UPLOAD_ROOT, requiredPrefix = '') {
  if (!value) return null;
  let pathname = String(value).trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const marker = '/uploads/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const relative = pathname.slice(markerIndex + marker.length).replace(/\\/g, '/');
  if (!relative || (requiredPrefix && !relative.startsWith(`${requiredPrefix}/`))) return null;
  const target = path.resolve(uploadRoot, relative);
  return isSafeChildPath(uploadRoot, target) ? target : null;
}

async function removeFileIfPresent(filePath, fsApi = fs.promises) {
  if (!filePath) return;
  try {
    await fsApi.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function removeDirectoryIfPresent(directoryPath, fsApi = fs.promises) {
  try {
    await fsApi.rm(directoryPath, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function deleteChatImageFiles(messages, uploadRoot = DEFAULT_UPLOAD_ROOT, fsApi = fs.promises) {
  const imagePaths = new Set(
    (messages || [])
      .filter(message => message?.type === 'image' || message?.imageUrl)
      .map(message => uploadUrlToSafePath(message.imageUrl, uploadRoot, 'chat'))
      .filter(Boolean)
  );
  for (const imagePath of imagePaths) await removeFileIfPresent(imagePath, fsApi);
  return imagePaths.size;
}

async function deleteUserUploadFiles({ userId, sentMessages, uploadRoot = DEFAULT_UPLOAD_ROOT, fsApi = fs.promises }) {
  const normalizedUserId = String(userId || '');
  if (!mongoose.isValidObjectId(normalizedUserId)) throw new AccountPurgeError('유효하지 않은 사용자 ID입니다.');

  const profileDirectory = path.resolve(uploadRoot, 'profile', normalizedUserId);
  if (!isSafeChildPath(uploadRoot, profileDirectory)) throw new AccountPurgeError('안전하지 않은 프로필 경로입니다.');
  await removeDirectoryIfPresent(profileDirectory, fsApi);

  const chatImageCount = await deleteChatImageFiles(sentMessages, uploadRoot, fsApi);
  return { profileDirectory, chatImageCount };
}

async function lean(query, fields = '') {
  let current = query;
  if (fields && typeof current?.select === 'function') current = current.select(fields);
  if (typeof current?.lean === 'function') current = current.lean();
  return current;
}

function modelSet(dependencies = {}) {
  return {
    User: dependencies.UserModel || models.User,
    Message: dependencies.MessageModel || models.Message,
    ChatRoom: dependencies.ChatRoomModel || models.ChatRoom,
    DeviceToken: dependencies.DeviceTokenModel || models.DeviceToken,
    UserAgreement: dependencies.UserAgreementModel || models.UserAgreement,
    FriendRequest: dependencies.FriendRequestModel || models.FriendRequest,
    AccountVerification: dependencies.AccountVerificationModel || models.AccountVerification,
    PhoneVerification: dependencies.PhoneVerificationModel || models.PhoneVerification,
    EmailVerification: dependencies.EmailVerificationModel || models.EmailVerification,
    PointLog: dependencies.PointLogModel || models.PointLog,
    UserDailyAgg: dependencies.UserDailyAggModel || models.UserDailyAgg,
    UserDailyScore: dependencies.UserDailyScoreModel || models.UserDailyScore,
    MembershipOrder: dependencies.MembershipOrderModel || models.MembershipOrder,
    Payment: dependencies.PaymentModel || models.Payment,
    Report: dependencies.ReportModel || models.Report,
    Notice: dependencies.NoticeModel || models.Notice,
  };
}

async function reconcileChatRooms({
  userId,
  sentMessages,
  Models,
  uploadRoot = DEFAULT_UPLOAD_ROOT,
  fsApi = fs.promises,
}) {
  const sentMessageIds = (sentMessages || []).map(message => message._id).filter(Boolean);
  const sentRoomIds = (sentMessages || []).map(message => message.chatRoom).filter(Boolean);
  const relatedRooms = await lean(Models.ChatRoom.find({
    $or: [
      { participants: userId },
      { 'hiddenFor.user': userId },
      { 'lastMessage.sender': userId },
      ...(sentRoomIds.length ? [{ _id: { $in: sentRoomIds } }] : []),
    ],
  }), '_id');
  const affectedRoomIds = [...new Set((relatedRooms || []).map(room => String(room._id)))];

  const pull = { participants: userId, hiddenFor: { user: userId } };
  if (sentMessageIds.length) pull.messages = { $in: sentMessageIds };
  if (affectedRoomIds.length) {
    await Models.ChatRoom.updateMany({ _id: { $in: affectedRoomIds } }, { $pull: pull });
  }

  await Models.Message.updateMany({ readBy: userId }, { $pull: { readBy: userId } });
  await Models.Message.deleteMany({ sender: userId });

  for (const roomId of affectedRoomIds) {
    const room = await lean(Models.ChatRoom.findById(roomId), '_id participants');
    if (!room) continue;
    if (!(room.participants || []).length) {
      const remainingMessages = await lean(
        Models.Message.find({ chatRoom: roomId }),
        'type imageUrl'
      );
      // 빈 방의 DB 메시지를 지우기 전에 안전한 chat 경로의 잔여 이미지를 함께 정리한다.
      await deleteChatImageFiles(remainingMessages, uploadRoot, fsApi);
      await Models.Message.deleteMany({ chatRoom: roomId });
      await Models.ChatRoom.deleteOne({ _id: roomId });
      await Models.Report.updateMany({ chatRoomId: roomId }, { $set: { chatRoomId: null } });
      await Models.PointLog.updateMany({ chatRoom: roomId }, { $set: { chatRoom: null } });
      continue;
    }
    const latest = await lean(
      Models.Message.findOne({ chatRoom: roomId }).sort({ createdAt: -1 }),
      'content imageUrl sender createdAt'
    );
    const lastMessage = latest
      ? {
          content: latest.content || '',
          imageUrl: latest.imageUrl || '',
          sender: latest.sender || null,
          createdAt: latest.createdAt,
        }
      : {};
    await Models.ChatRoom.updateOne({ _id: roomId }, { $set: { lastMessage } });
  }

  // 이전 실패나 TTL 정리로 남은 빈 방도 재시도 시 안전하게 마무리한다.
  const emptyRooms = await lean(Models.ChatRoom.find({ participants: { $size: 0 } }), '_id');
  const emptyRoomIds = (emptyRooms || []).map(room => room._id);
  if (emptyRoomIds.length) {
    const remainingMessages = await lean(
      Models.Message.find({ chatRoom: { $in: emptyRoomIds } }),
      'type imageUrl'
    );
    await deleteChatImageFiles(remainingMessages, uploadRoot, fsApi);
    await Models.Message.deleteMany({ chatRoom: { $in: emptyRoomIds } });
    await Models.Report.updateMany({ chatRoomId: { $in: emptyRoomIds } }, { $set: { chatRoomId: null } });
    await Models.PointLog.updateMany({ chatRoom: { $in: emptyRoomIds } }, { $set: { chatRoom: null } });
    await Models.ChatRoom.deleteMany({ _id: { $in: emptyRoomIds } });
  }

  return { affectedRoomIds, sentMessageIds, emptyRoomIds };
}

async function purgeExpiredUser(userId, options = {}, dependencies = {}) {
  const normalizedUserId = String(userId || '');
  if (!mongoose.isValidObjectId(normalizedUserId)) throw new AccountPurgeError('유효하지 않은 사용자 ID입니다.');
  const now = options.now || new Date();
  const Models = modelSet(dependencies);

  const user = await lean(Models.User.findOne({
    _id: normalizedUserId,
    status: 'pendingDeletion',
    deletionDueAt: { $lte: now },
  }), '_id email phone loginPhone');
  if (!user) return { purged: false, reason: 'not_eligible' };

  const sentMessages = await lean(
    Models.Message.find({ sender: normalizedUserId }),
    '_id chatRoom type imageUrl'
  );
  const fileResult = await deleteUserUploadFiles({
    userId: normalizedUserId,
    sentMessages,
    uploadRoot: options.uploadRoot || DEFAULT_UPLOAD_ROOT,
    fsApi: dependencies.fsApi || fs.promises,
  });

  const chatResult = await reconcileChatRooms({
    userId: normalizedUserId,
    sentMessages,
    Models,
    uploadRoot: options.uploadRoot || DEFAULT_UPLOAD_ROOT,
    fsApi: dependencies.fsApi || fs.promises,
  });

  await Models.DeviceToken.deleteMany({ userId: normalizedUserId });
  await Models.UserAgreement.deleteMany({ userId: normalizedUserId });
  await Models.FriendRequest.deleteMany({ $or: [{ from: normalizedUserId }, { to: normalizedUserId }] });
  await Models.AccountVerification.deleteMany({ userId: normalizedUserId });

  const phones = [...new Set([user.phone, user.loginPhone].filter(Boolean).map(String))];
  if (phones.length) await Models.PhoneVerification.deleteMany({ phone: { $in: phones } });
  if (user.email) await Models.EmailVerification.deleteMany({ email: String(user.email).trim().toLowerCase() });

  await Models.PointLog.deleteMany({ user: normalizedUserId });
  await Models.PointLog.updateMany({ relatedUser: normalizedUserId }, { $set: { relatedUser: null } });
  await Models.UserDailyAgg.deleteMany({ user: normalizedUserId });
  await Models.UserDailyScore.deleteMany({ user: normalizedUserId });
  await Models.MembershipOrder.deleteMany({
    user: normalizedUserId,
    status: { $in: MOCK_MEMBERSHIP_STATUSES },
  });

  // 실제 결제·신고·운영 로그는 법적·운영상 보존한다. MembershipOrder.user와
  // Report.reporterUserId/reportedUserId는 required이므로 스키마를 깨지 않고 참조를 유지한다.
  // optional 참조만 null 처리해 탈퇴자와의 불필요한 연결을 최소화한다.
  await Models.Payment.updateMany({ userId: normalizedUserId }, { $set: { userId: null } });
  await Models.Report.updateMany({ reviewedBy: normalizedUserId }, { $set: { reviewedBy: null } });
  await Models.Notice.updateMany({ author: normalizedUserId }, { $set: { author: null } });
  await Models.User.updateMany(
    { _id: { $ne: normalizedUserId } },
    { $pull: { friendlist: normalizedUserId, blocklist: normalizedUserId } }
  );
  await Models.User.updateMany(
    { suspendedBy: normalizedUserId },
    { $set: { suspendedBy: null } }
  );

  // 모든 종속 데이터와 파일 정리가 성공한 경우에만 User를 마지막으로 삭제한다.
  const deletion = await Models.User.deleteOne({
    _id: normalizedUserId,
    status: 'pendingDeletion',
    deletionDueAt: { $lte: now },
  });
  return {
    purged: Boolean(deletion?.deletedCount),
    fileResult,
    chatResult,
    preserved: ['paid_membership_orders', 'payments', 'reports', 'admin_logs'],
  };
}

module.exports = {
  AccountPurgeError,
  DEFAULT_UPLOAD_ROOT,
  MOCK_MEMBERSHIP_STATUSES,
  isSafeChildPath,
  uploadUrlToSafePath,
  deleteChatImageFiles,
  deleteUserUploadFiles,
  reconcileChatRooms,
  purgeExpiredUser,
};
