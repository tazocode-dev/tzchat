// models/Legal/Terms.js
const mongoose = require('mongoose');

const TermsSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, index: true },   // ex) terms, privacy, marketing-consent
    title: { type: String, required: true },
    version: { type: String, required: true },             // ex) "2025-09-30-01" (문자열 버전)
    content: { type: String, required: true },             // HTML or Markdown 본문
    body: { type: String },                                // 과거 호환용
    kind: { type: String, enum: ['page', 'consent'], required: true },
    defaultRequired: { type: Boolean, default: false },    // consent 전용: 필수 여부
    isRequired: { type: Boolean, default: false },         // legacy 호환 (defaultRequired와 동일하게 저장)
    isActive: { type: Boolean, default: true },            // 현재 활성본 여부
    publishedAt: { type: Date, default: Date.now },
    effectiveAt: { type: Date, default: Date.now },        // 효력 발생일
  },
  { timestamps: true }
);

// 같은 slug에서 version은 유니크
TermsSchema.index({ slug: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('Terms', TermsSchema);
