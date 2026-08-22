// models/Social/FriendRequest.js
// ------------------------------------------------------------
// 친구 신청 모델
// - 운영 포인트:
//   1) partial unique index(from,to,status=pending) → 대기중 중복 신청만 차단
//   2) 목록 조회 정렬 최적화 인덱스: (to,status,createdAt) / (from,status,createdAt)
//   3) 자기 자신에게 신청 방지(from !== to) 스키마 레벨 유효성
//   4) timestamps: true → createdAt/updatedAt 자동 관리, versionKey 제거
// - 로그/주석 풍부
// ------------------------------------------------------------

const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',               // 신청자
      required: true,
      index: true,               // 조회 최적화(보낸 목록)
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',               // 받는 사람
      required: true,
      index: true,               // 조회 최적화(받은 목록)
    },
    message: {
      type: String,              // 신청 메시지 (선택)
      default: '',
      trim: true,
      maxlength: 300,
    },
    matchType: {
      type: String,
      enum: ['general', 'speed'],
      default: 'general',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'], // 운영 정책상 block= rejected 처리
      default: 'pending',
      index: true,               // 상태 기반 필터링 자주 사용
    },
    // createdAt/updatedAt 은 timestamps 옵션으로 자동 생성
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ✅ 스키마 레벨 유효성: 자기 자신에게 신청 불가
friendRequestSchema.pre('validate', function (next) {
  try {
    if (this.from && this.to && String(this.from) === String(this.to)) {
      return next(new mongoose.Error.ValidationError(
        Object.assign(new Error('자기 자신에게 친구 신청할 수 없습니다.'), {
          errors: {
            to: { message: '자기 자신에게 친구 신청할 수 없습니다.' }
          }
        })
      ));
    }
    return next();
  } catch (e) {
    return next(e);
  }
});

// ✅ 대기중(pending) 상태에서만 (from,to) 유니크 → 재신청 허용(accepted/rejected 이후)
friendRequestSchema.index(
  { from: 1, to: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'uniq_pending_from_to',
  }
);

// 📈 목록 조회용 최적화 인덱스 (정렬 포함)
//  - API에서 보통 createdAt DESC 정렬을 사용하므로 복합 인덱스에 포함
friendRequestSchema.index({ to: 1, status: 1, createdAt: -1 }, { name: 'idx_to_status_createdAt' });
friendRequestSchema.index({ from: 1, status: 1, createdAt: -1 }, { name: 'idx_from_status_createdAt' });
friendRequestSchema.index({ to: 1, matchType: 1, status: 1, createdAt: -1 }, { name: 'idx_to_match_status_createdAt' });
friendRequestSchema.index({ from: 1, matchType: 1, status: 1, createdAt: -1 }, { name: 'idx_from_match_status_createdAt' });

// 🧪 저장 전 로그 (운영에서 과하면 주석 처리)
friendRequestSchema.pre('save', function (next) {
  try {
    console.log(
      '📝 [FriendRequest][save] from=%s → to=%s, status=%s, _id=%s',
      String(this.from),
      String(this.to),
      this.status,
      String(this._id)
    );
  } catch (_) {}
  next();
});

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
