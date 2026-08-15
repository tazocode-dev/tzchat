// src/controllers/chat/chatMessage.controller.js
// ────────────────────────────────────────────────────────────
// 채팅 메시지 컨트롤러: 업로드 미들웨어(multer/sharp) + 요청 파싱 + 응답 조립.
// 메시지/읽음 처리 로직은 services/chat/chatMessageService.js가 담당한다.
// -------------------------------------------------------------
// 저장 경로: /uploads/chat/YYYY/MM/DD/<roomId>/<uuid>.(jpg|png|webp|gif)
// ────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');

const { ChatRoom } = require('@/models');
const { toAbsoluteMediaUrl } = require('@/utils/mediaUrl');
const { ChatMessageError, sendMessage, notifyNewMessage, markAsRead } = require('@/services/chat/chatMessageService');

const log = (...args) => console.log('[chatMessageRouter]', ...args);
const getEmit = (req) => { try { return req.app.get('emit'); } catch { return null; } };
const getIO   = (req) => { try { return req.app.get('io'); }   catch { return null; } };
function getMyId(req) { return req?.user?._id || req?.session?.user?._id || null; }
function genId() { return crypto.randomBytes(16).toString('hex'); }

/* ===========================================
 * 업로드 경로 유틸
 * =========================================== */
const UPLOAD_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');
const CHAT_ROOT = path.join(UPLOAD_ROOT, 'chat');
function ensureDirSync(dir) { try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) { console.error('[upload] mkdir failed:', dir, e); } }
ensureDirSync(UPLOAD_ROOT); ensureDirSync(CHAT_ROOT);

function getChatDest(req) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const roomId = String(req.params.id || req.body.roomId || 'misc');
  const dest = path.join(CHAT_ROOT, yyyy, mm, dd, roomId);
  ensureDirSync(dest);
  return { dest, yyyy, mm, dd, roomId };
}

/* ===========================================
 * Multer 설정
 * =========================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { const { dest } = getChatDest(req); cb(null, dest); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => { const ext = (path.extname(file.originalname) || '').toLowerCase(); cb(null, `${genId()}${ext || ''}`); }
});
const fileFilter = (req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) return cb(new Error('이미지 파일만 업로드할 수 있습니다.'), false);
  cb(null, true);
};
const uploadMiddleware = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

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
      return res.status(err.status).json({ message: err.message });
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
      return res.status(err.status).json({ message: err.message });
    }
    console.error('[chatMessageRouter][ERR]/read', err?.message);
    return res.status(500).json({ message: '읽음 처리 실패' });
  }
}

/* ===========================================
 * [3] 이미지 업로드
 * =========================================== */
async function postUploadImage(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });

    const { id: roomId } = req.params;
    const room = await ChatRoom.findById(roomId).select('_id participants');
    const isMember = room?.participants?.some(p => String(p) === String(myId));
    if (!room || !isMember) return res.status(403).json({ message: '채팅방 접근 권한 없음' });

    const file = req.file;
    if (!file) return res.status(400).json({ message: '파일이 존재하지 않습니다.' });

    const originalPath = file.path;
    const origExt = (path.extname(file.originalname) || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    const { yyyy, mm, dd } = getChatDest(req);
    const destDir = path.dirname(originalPath);
    const idPart = genId();

    let targetFormat = 'jpeg';
    if (mime.includes('png') || origExt === '.png') targetFormat = 'png';
    if (mime.includes('webp') || origExt === '.webp') targetFormat = 'webp';
    const isGif = mime.includes('gif') || origExt === '.gif';

    let finalFilename; let finalAbsPath;

    if (isGif) {
      finalFilename = `${idPart}.gif`;
      finalAbsPath = path.join(destDir, finalFilename);
      fs.copyFileSync(originalPath, finalAbsPath);
      fs.unlinkSync(originalPath);
    } else {
      const ext = targetFormat === 'jpeg' ? '.jpg' : `.${targetFormat}`;
      finalFilename = `${idPart}${ext}`;
      finalAbsPath = path.join(destDir, finalFilename);

      let pipeline = sharp(originalPath).resize({ width: 1024, withoutEnlargement: true }).rotate();
      if (targetFormat === 'jpeg') pipeline = pipeline.jpeg({ quality: 70, mozjpeg: true });
      if (targetFormat === 'png')  pipeline = pipeline.png({ compressionLevel: 8 });
      if (targetFormat === 'webp') pipeline = pipeline.webp({ quality: 75 });

      await pipeline.toFile(finalAbsPath);
      fs.unlinkSync(originalPath);
    }

    const relativePath = `/uploads/chat/${yyyy}/${mm}/${dd}/${roomId}/${finalFilename}`;

    // 응답은 절대 URL도 내려주되, 프론트는 relativePath를 쓰는 게 정석
    const imageUrl = toAbsoluteMediaUrl(relativePath, req);

    log('✅ [upload-image] saved:', relativePath, '⇒', imageUrl, '| mime=', mime);
    return res.json({ imageUrl, relativePath });
  } catch (err) {
    console.error('[chatMessageRouter][ERR]/upload-image', err?.message);
    return res.status(500).json({ message: '이미지 업로드 실패' });
  }
}

module.exports = { uploadMiddleware, postMessage, putRead, postUploadImage };
