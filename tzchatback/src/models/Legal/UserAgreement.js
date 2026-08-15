// models/Legal/UserAgreement.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserAgreementSchema = new Schema(
  {
    // 누구의 동의인지
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // 어떤 문서(slug)에 대한 동의인지
    slug: { type: String, required: true }, // ex) privacy-consent, sharing-consent, xborder-consent, marketing-consent

    // 동의한 문서 버전 (문자열 포맷으로 통일: 예 "2025-09-30-01")
    version: { type: String, required: true },

    // 동의 일시
    agreedAt: { type: Date, default: Date.now },

    // 선택 동의용 (예: marketing-consent)
    // - true: 수신 동의
    // - false: 거부(철회)
    // 필수 동의의 경우 이 값은 의미가 없지만 필드 존재로 인한 문제는 없습니다.
    optedIn: { type: Boolean, default: true },

    // (선택) 당시 문서 스냅샷/추적을 위한 참조 및 메타
    docId: { type: Schema.Types.ObjectId, ref: 'Terms' }, // 동의 당시의 Terms 문서 ObjectId
    meta: {
      title: { type: String },
      kind: { type: String, enum: ['page', 'consent'] },
      defaultRequired: { type: Boolean },
      effectiveAt: { type: Date },
    },
  },
  { timestamps: true }
);

// 사용자별 동일 slug는 1개 행(최신 동의로 갱신)
UserAgreementSchema.index({ userId: 1, slug: 1 }, { unique: true });

// 조회 최적화용 인덱스(선택)
UserAgreementSchema.index({ slug: 1, version: 1 });

module.exports = mongoose.model('UserAgreement', UserAgreementSchema);
