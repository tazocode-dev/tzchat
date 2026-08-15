// backend/models/User/User.js
// ------------------------------------------------------------
// User 모델
// - 휴대폰 정규화/해시 자동화
// - ✅ 전화번호 중복 가입 허용 정책 반영: phone/phoneHash UNIQUE 제거
// - 전화번호 검증 시각과 수단을 저장
// - ✅ phoneMasked / phoneFormatted 가상필드 제공 (프론트에서 기대하는 경우 대비)
// ------------------------------------------------------------
const mongoose = require('mongoose');
const crypto = require('crypto');
const retention = require('@/config/retention'); // DELETION_GRACE_DAYS
const {
  getDailyHeartGrant,
  getHeartCap,
  isHeartAccumulable,
  getPrevGrantTimeKST,
  getSignupBonus,
  getLevelChangeBonus,
} = require('@/config/points');

// ────────────────────────────────────────────────────────────
// [서브스키마] 프로필 이미지 문서 구조
// ────────────────────────────────────────────────────────────
const ProfileImageSchema = new mongoose.Schema(
  {
    id:        { type: String, required: true },
    kind:      { type: String, enum: ['avatar', 'gallery'], default: 'gallery' },
    aspect:    { type: Number, default: 0.8 },
    urls: {
      thumb:   { type: String, required: true },
      medium:  { type: String, required: true },
      full:    { type: String, required: true },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────
/** 한국 번호 E.164 정규화 */
function normalizePhoneKR(raw = '') {
  const clean = String(raw).replace(/[^\d+]/g, '');
  if (!clean) return '';
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('0')) return '+82' + clean.slice(1);
  if (clean.startsWith('82')) return '+' + clean;
  return '+82' + clean;
}
function sha256Hex(text = '') {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// E.164(+82...) → 010xxxxxxxx 형태로 변환(가능할 때만)
function toKRLocalDigits(e164 = '') {
  const p = String(e164 || '');
  if (!p) return '';
  if (p.startsWith('+82')) {
    // +8210xxxxxxxx → 010xxxxxxxx
    const rest = p.slice(3);
    if (!rest) return '';
    return '0' + rest;
  }
  return p;
}
function maskPhoneDigitsKR(localDigits = '') {
  // 010xxxxxxxx 또는 01x...
  const s = String(localDigits || '').replace(/[^\d]/g, '');
  if (s.length < 7) return s;
  // 마지막 2~4자리만 남기고 중간 마스킹
  // 010 + (중간) + (끝 2~4)
  const last = s.slice(-2);
  const head = s.slice(0, 3);
  const midLen = Math.max(0, s.length - head.length - last.length);
  return `${head} ${'*'.repeat(midLen)} ${last}`.replace(/\s+/g, ' ');
}

// ────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    // [0] 권한/상태
    role: { type: String, enum: ['user', 'master'], default: 'user' },
    suspended: { type: Boolean, default: false },

    // [1] 기본 정보
    // ✅ 이메일 인증 전환: username/password는 더 이상 신규가입 필수 항목이 아니다
    //    (기존 아이디-비밀번호 계정과의 호환을 위해 필드 자체는 유지, 관리자 로그인도 계속 사용)
    username: { type: String, required: false, default: undefined, trim: true },
    password: { type: String, required: false, select: false, default: undefined },
    nickname: { type: String, required: true },
    birthyear: Number,
    // 기존 생년월일 저장 계정 호환용이다. 신규 온보딩은 birthyear만 저장한다.
    birthDate: { type: Date, default: null },
    gender: String,
    profileOnboardingCompletedAt: { type: Date, default: null },

    // ✅ 이메일 인증 로그인 식별자 (신규 기본 인증 수단)
    email: { type: String, required: false, default: undefined, trim: true, lowercase: true },
    emailVerifiedAt: { type: Date, default: null },

    // [2] 프로필
    region1: { type: String, default: '미지정' },
    region2: { type: String, default: '미지정' },
    preference: { type: String, default: '이성친구 - 일반' },
    selfintro: { type: String, default: '' },

    profileImages: { type: [ProfileImageSchema], default: [] },
    profileMain:   { type: String, default: '' },

    // [3] 검색 조건
    search_birthyear1: { type: Number, default: null },
    search_birthyear2: { type: Number, default: null },
    search_region1: { type: String, default: '전체' },
    search_region2: { type: String, default: '전체' },
    search_preference: { type: String, default: '이성친구 - 전체' },

    // 유료회원 관련
    user_level: {
      type: String,
      enum: ['베타회원', '일반회원', '라이트회원', '프리미엄회원'],
      default: '베타회원'
    },
    refundCountTotal: { type: Number, default: 0, min: 0 },

    // 포인트 지갑
    heart: { type: Number, default: 0, min: 0 },
    star:  { type: Number, default: 0, min: 0 },
    ruby:  { type: Number, default: 0, min: 0 },
    lastDailyGrantAt: { type: Date, default: null },

    search_regions: {
      type: [{
        region1: { type: String, required: true },
        region2: { type: String, required: true }
      }],
      default: []
    },

    // [4] 기타
    profileImage: String,
    last_login: { type: Date, default: null },

    // [5] 친구/차단
    friendlist: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: []
    },
    blocklist: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: []
    },

    // [6] Emergency
    emergency: {
      type: {
        isActive: { type: Boolean, default: false },
        activatedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
        slotKey: { type: String, default: '' }
      },
      default: () => ({ isActive: false, activatedAt: null, expiresAt: null, slotKey: '' })
    },

    // ────────────────────────────────────────────────────────
    // 휴대폰/검증 메타
    // ────────────────────────────────────────────────────────
    phone: {
      type: String,
      required: false,
      default: undefined,
      trim: true,
    },

    // 전화 로그인 식별자. 기존 phone 중복 허용 데이터와 분리해 신규 로그인 연결만 고유하게 보장한다.
    loginPhone: {
      type: String,
      required: false,
      default: undefined,
      trim: true,
      select: false,
    },

    // 문자 인증 검증 메타
    phoneVerifiedAt: { type: Date, default: null },
    phoneVerifiedBy: { type: String, default: '' },

    // 고속 비교용 해시(중복 허용 정책이므로 UNIQUE 금지)
    phoneHash: {
      type: String,
      select: false,
    },

    localContactHashes: {
      type: [String],
      default: [],
      select: false,
    },

    // 스위치들
    search_disconnectLocalContacts: { type: String, default: 'OFF' },
    search_allowFriendRequests:     { type: String, default: 'OFF' },
    search_allowNotifications:      { type: String, default: 'OFF' },
    search_onlyWithPhoto:           { type: String, default: 'OFF' },
    search_matchPremiumOnly:        { type: String, default: 'OFF' },

    marriage: { type: String, default: '미혼' },
    search_marriage: { type: String, default: '전체' },

    // [7] 누적 카운터
    sentRequestCountTotal: { type: Number, default: 0, min: 0 },
    receivedRequestCountTotal: { type: Number, default: 0, min: 0 },
    acceptedChatCountTotal: { type: Number, default: 0, min: 0 },

    // 사용자별 활동 알림 상태. 변경 시각과 확인 시각을 분리해 다른 사용자의
    // 화면 열람이나 앱 재실행이 내 NEW 표시를 지우지 않도록 한다.
    notificationChanges: {
      friendRequestsAt: { type: Date, default: null },
      speedResultsAt: { type: Date, default: null },
      friendsAt: { type: Date, default: null },
      blocksAt: { type: Date, default: null },
    },
    notificationSeenAt: {
      friendRequestsAt: { type: Date, default: null },
      speedResultsAt: { type: Date, default: null },
      friendsAt: { type: Date, default: null },
      blocksAt: { type: Date, default: null },
    },

    // 탈퇴 관리
    status: { type: String, enum: ['active', 'pendingDeletion', 'deleted'], default: 'active' },
    deletionRequestedAt: { type: Date, default: null },
    deletionDueAt: { type: Date, default: null },

    // 호환용
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ────────────────────────────────────────────────────────────
// ✅ 가상필드: phoneFormatted / phoneMasked
// (프론트에서 me.phoneMasked / me.phoneFormatted 를 기대하는 경우 대비)
// ────────────────────────────────────────────────────────────
userSchema.virtual('phoneFormatted').get(function () {
  const local = toKRLocalDigits(this.phone || '');
  return local || '';
});
userSchema.virtual('phoneMasked').get(function () {
  const local = toKRLocalDigits(this.phone || '');
  if (!local) return '';
  return maskPhoneDigitsKR(local);
});

// ────────────────────────────────────────────────────────────
// 응답 변환: 민감정보 제거
// ────────────────────────────────────────────────────────────
function removeSensitive(_doc, ret) {
  try {
    delete ret.password;
    delete ret.loginPhone;
    delete ret.phoneHash;
    delete ret.localContactHashes;
    return ret;
  } catch (_) {
    return ret;
  }
}
userSchema.set('toJSON',  { virtuals: true, transform: removeSensitive });
userSchema.set('toObject', { virtuals: true, transform: removeSensitive });

// ────────────────────────────────────────────────────────────
// 인덱스
// ────────────────────────────────────────────────────────────
userSchema.index({ status: 1, deletionDueAt: 1 });
userSchema.index({ isDeleted: 1, deletionDueAt: 1 });

// username / nickname 유니크
// ✅ username은 이메일 인증 가입자에게는 없을 수 있으므로 sparse로 전환
//    (username이 없는 문서는 유니크 검사에서 제외 — 여러 명이 username 없이 존재 가능)
userSchema.index({ username: 1 }, { unique: true, sparse: true, name: 'username_1' });
userSchema.index({ nickname: 1 }, { unique: true, name: 'nickname_1' });

// ✅ 이메일: 로그인 식별자, 정규화(소문자) 후 유니크. 기존 회원은 email이 없을 수 있으므로 sparse.
userSchema.index({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });

// 운영상 필요 시
userSchema.index({ isDeleted: 1 });
userSchema.index({ deletedAt: 1 });

// ✅ phone / phoneHash 는 “중복 허용” 정책: UNIQUE 제거하고 일반 인덱스만
userSchema.index(
  { phone: 1 },
  {
    name: 'phone_1',
    partialFilterExpression: { phone: { $exists: true, $ne: '' } },
  }
);
userSchema.index({ phoneHash: 1 }, { sparse: true, name: 'phoneHash_1' });
userSchema.index(
  { loginPhone: 1 },
  {
    unique: true,
    name: 'loginPhone_1',
    partialFilterExpression: { loginPhone: { $exists: true, $type: 'string' } },
  }
);

// 등급별
userSchema.index({ user_level: 1 });

// ✅ 긴급모드(스피드 매칭) 활성 사용자 조회 최적화
// emergencyModeService.listActiveUsers()/filterActiveUsersByRegion()가
// { 'emergency.isActive': true, 'emergency.activatedAt': { $gte: windowAgo } }로
// 매 요청마다 컬렉션 전체를 스캔하고 있어 추가함.
userSchema.index({ 'emergency.isActive': 1, 'emergency.expiresAt': 1 }, { name: 'speed_matching_active_idx' });

// ────────────────────────────────────────────────────────────
// 메서드/훅
// ────────────────────────────────────────────────────────────
userSchema.methods.requestDeletion = function() {
  const now = new Date();
  this.status = 'pendingDeletion';
  this.deletionRequestedAt = now;
  this.deletedAt = now;
  this.isDeleted = true;
  const days = retention?.DELETION_GRACE_DAYS ?? 14;
  this.deletionDueAt = new Date(now.getTime() + days * 86400000);
};

userSchema.methods.cancelDeletion = function() {
  this.status = 'active';
  this.deletionRequestedAt = null;
  this.deletionDueAt = null;
  this.deletedAt = null;
  this.isDeleted = false;
};

// 탈퇴 정합성
userSchema.pre('save', function(next) {
  try {
    if (this.status === 'pendingDeletion' || this.status === 'deleted') {
      this.isDeleted = true;
      if (!this.deletedAt) this.deletedAt = this.deletionRequestedAt || new Date();
      if (!this.deletionDueAt && this.status === 'pendingDeletion') {
        const days = retention?.DELETION_GRACE_DAYS ?? 14;
        this.deletionDueAt = new Date(Date.now() + days * 86400000);
      }
    } else {
      this.isDeleted = false;
      if (!this.deletionRequestedAt) this.deletedAt = null;
      if (!this.deletionRequestedAt) this.deletionDueAt = null;
    }
    next();
  } catch (e) {
    console.error('[User.pre.save] error:', e);
    next(e);
  }
});

// 등급 변경 시 하트 갱신
userSchema.pre('save', function(next) {
  try {
    if (this.isModified('user_level')) {
      const level = this.user_level || '일반회원';
      const base = getDailyHeartGrant(level);
      const cap = getHeartCap(level);
      const accum = isHeartAccumulable(level);

      let nextHeart = base;
      if (accum && Number.isFinite(cap) && cap >= 0) {
        nextHeart = Math.min(nextHeart, cap);
      }
      this.heart = Math.max(0, nextHeart);
    }
    next();
  } catch (e) {
    console.error('[User.pre.save][level-change] error:', e);
    next(e);
  }
});

// ✅ 휴대폰 정규화 + phoneHash 생성
userSchema.pre('save', function(next) {
  try {
    if (this.isModified('phone')) {
      const raw = this.phone;

      if (raw === undefined || raw === null || String(raw).trim() === '') {
        this.phone = undefined;
        this.phoneHash = undefined;
        return next();
      }

      const normalized = normalizePhoneKR(raw);
      if (!normalized) return next(new Error('유효한 휴대폰 번호가 아닙니다.'));

      this.phone = normalized;
      this.phoneHash = sha256Hex(normalized);
    } else if (!this.phoneHash && this.phone) {
      const normalized = normalizePhoneKR(this.phone);
      if (normalized) {
        this.phone = normalized;
        this.phoneHash = sha256Hex(normalized);
      } else {
        this.phone = undefined;
        this.phoneHash = undefined;
      }
    }
    next();
  } catch (e) {
    console.error('[User.pre.save][phone] error:', e);
    next(e);
  }
});

// 가입 보너스
userSchema.pre('save', function(next) {
  try {
    if (this.isNew) {
      const level = this.user_level || '일반회원';
      const bonus = getSignupBonus(level) || {};
      const addStar = Number(bonus.star || 0);
      const addRuby = Number(bonus.ruby || 0);

      this.star = Math.max(0, (Number(this.star || 0) + addStar));
      this.ruby = Math.max(0, (Number(this.ruby || 0) + addRuby));

      this.lastDailyGrantAt = getPrevGrantTimeKST(new Date());
    }
    next();
  } catch (e) {
    console.error('[User.pre.save][signup-bonus] error:', e);
    next(e);
  }
});

// 등급 변경 보너스
userSchema.pre('save', function(next) {
  try {
    if (this.isModified('user_level') && !this.isNew) {
      const level = this.user_level || '일반회원';
      const bonus = getLevelChangeBonus(level) || {};
      const addStar = Number(bonus.star || 0);
      const addRuby = Number(bonus.ruby || 0);

      this.star = Math.max(0, (Number(this.star || 0) + addStar));
      this.ruby = Math.max(0, (Number(this.ruby || 0) + addRuby));
    }
    next();
  } catch (e) {
    console.error('[User.pre.save][level-change-bonus] error:', e);
    next(e);
  }
});

// 백필 옵션
userSchema.statics.backfillPhoneHash = async function() {
  const batch = await this.find({
    $or: [ { phoneHash: { $exists: false } }, { phoneHash: null } ]
  }).select('_id phone phoneHash');

  for (const doc of batch) {
    const normalized = normalizePhoneKR(doc.phone || '');
    if (!normalized) {
      doc.phone = undefined;
      doc.phoneHash = undefined;
      await doc.save();
      continue;
    }
    doc.phone = normalized;
    doc.phoneHash = sha256Hex(normalized);
    await doc.save();
  }
};

module.exports = mongoose.model('User', userSchema);
