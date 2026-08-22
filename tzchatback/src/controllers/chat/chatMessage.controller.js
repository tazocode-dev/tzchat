// src/controllers/chat/chatMessage.controller.js
// ────────────────────────────────────────────────────────────
// 채팅 메시지 컨트롤러: 업로드 미들웨어(multer/sharp) + 요청 파싱 + 응답 조립.
// 메시지/읽음 처리 로직은 services/chat/chatMessageService.js가 담당한다.
// -------------------------------------------------------------
// 저장 경로: /uploads/chat/YYYY/MM/DD/<roomId>/<uuid>.jpg
// ────────────────────────────────────────────────────────────

const multer = require('multer');

const { toAbsoluteMediaUrl } = require('@/utils/mediaUrl');
const {
  ChatMessageError,
  assertCanUseChatRoom,
  sendMessage,
  notifyNewMessage,
  markAsRead,
  validateChatImagePathForDb,
} = require('@/services/chat/chatMessageService');
const {
  ImageUploadError,
  MAX_IMAGE_UPLOAD_BYTES,
  createImageFileFilter,
  createPrivateTempStorage,
  processChatImageUpload,
  removeFileQuietly,
  removeUploadedTempFiles,
  validateChatRoomId,
  wrapUploadMiddleware,
} = require('@/services/media/imageUploadSecurityService');

const log = (...args) => console.log('[chatMessageRouter]', ...args);
const getEmit = (req) => { try { return req.app.get('emit'); } catch { return null; } };
const getIO   = (req) => { try { return req.app.get('io'); }   catch { return null; } };
function getMyId(req) { return req?.user?._id || req?.session?.user?._id || null; }

/* ===========================================
 * Multer 설정
 * =========================================== */
const uploadMiddleware = multer({
  storage: createPrivateTempStorage('chat'),
  fileFilter: createImageFileFilter(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 },
});
const uploadSingleImage = wrapUploadMiddleware(uploadMiddleware.single('image'));

async function preflightUpload(req, res, next) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const roomId = validateChatRoomId(req.params.id);
    await assertCanUseChatRoom(roomId, myId);
    return next();
  } catch (err) {
    if (err instanceof ImageUploadError) {
      return res.status(err.status).json({ code: err.code, message: err.message });
    }
    if (err instanceof ChatMessageError) {
      return res.status(err.status).json({ ...(err.code ? { code: err.code } : {}), message: err.message });
    }
    console.error('[chatMessageRouter][ERR]/upload-image/preflight', err?.message);
    return res.status(500).json({ message: '이미지 업로드 권한 확인 실패' });
  }
}

/* ===========================================
 * [1] 메시지 전송 (텍스트/이미지)
 * =========================================== */
async function postMessage(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });

    const { id } = req.params;
    const { content, type } = req.body;

    const { chatRoom, message } = await sendMessage(id, myId, { content, type }, req);

    await notifyNewMessage({ req, getEmit, getIO, chatRoom, message, myId });

    return res.json(message);
  } catch (err) {
    if (err instanceof ChatMessageError) {
      return res.status(err.status).json({ ...(err.code ? { code: err.code } : {}), message: err.message });
    }
    console.error('[chatMessageRouter][ERR]/message', err?.message);
    return res.status(500).json({ message: '서버 오류' });
  }
}

/* ===========================================
 * [2] 읽음 처리
 * =========================================== */
async function putRead(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id: roomId } = req.params;

    const { ids } = await markAsRead(roomId, myId);

    const emit = getEmit(req);
    if (emit && typeof emit.chatMessagesRead === 'function') {
      await emit.chatMessagesRead(String(roomId), String(myId), ids.map(String));
    } else {
      const io = getIO(req);
      if (io) io.to(`user:${String(myId)}`).emit('chatrooms:badge', { changedRoomId: String(roomId) });
    }

    return res.json({ updatedMessageIds: ids });
  } catch (err) {
    if (err instanceof ChatMessageError) {
      return res.status(err.status).json({ ...(err.code ? { code: err.code } : {}), message: err.message });
    }
    console.error('[chatMessageRouter][ERR]/read', err?.message);
    return res.status(500).json({ message: '읽음 처리 실패' });
  }
}

/* ===========================================
 * [3] 이미지 업로드
 * =========================================== */
async function postUploadImage(req, res) {
  const file = req.file;
  let finalAbsPath = null;
  try {
    const myId = getMyId(req);
    if (!myId) {
      removeUploadedTempFiles(file);
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }

    const roomId = validateChatRoomId(req.params.id);
    const processed = await processChatImageUpload({ file, roomId });
    finalAbsPath = processed.finalAbsPath;
    const { relativePath } = processed;
    validateChatImagePathForDb(relativePath, roomId);

    // 응답은 절대 URL도 내려주되, 프론트는 relativePath를 쓰는 게 정석
    const imageUrl = toAbsoluteMediaUrl(relativePath, req);

    log('✅ [upload-image] saved:', relativePath);
    return res.json({ imageUrl, relativePath });
  } catch (err) {
    removeUploadedTempFiles(file);
    removeFileQuietly(finalAbsPath);
    if (err instanceof ImageUploadError || err instanceof ChatMessageError) {
      return res.status(err.status).json({ ...(err.code ? { code: err.code } : {}), message: err.message });
    }
    console.error('[chatMessageRouter][ERR]/upload-image', err?.message);
    return res.status(500).json({ message: '이미지 업로드 실패' });
  }
}

module.exports = {
  uploadMiddleware,
  uploadSingleImage,
  preflightUpload,
  postMessage,
  putRead,
  postUploadImage,
};
