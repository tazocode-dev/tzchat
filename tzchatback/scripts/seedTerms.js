// 실행: NODE_ENV=development node scripts/seedTerms.js
// 공개 법적 본문은 GitHub Pages만 사용하며 DB에는 동의 판정용 메타데이터만 둔다.

require('module-alias/register');

const mongoose = require('mongoose');
const { safeErrorDetails } = require('./scriptSafety');

const LEGAL_PUBLIC_BASE_URL = 'https://tazocode-dev.github.io/tazocode-legal/tzchat/';
const AGREEMENT_VERSION = '2026-08-13-01';
const EFFECTIVE_AT = new Date('2026-08-13T00:00:00.000Z');

const AGREEMENT_METADATA = [
  {
    slug: 'terms',
    title: '서비스 이용약관',
    kind: 'page',
    isRequired: true,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}terms.html`,
  },
  {
    slug: 'guidelines',
    title: '커뮤니티 안전 가이드',
    kind: 'page',
    isRequired: true,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}terms.html#prohibited`,
  },
  {
    slug: 'youth-policy',
    title: '아동 안전 기준',
    kind: 'page',
    isRequired: true,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}child-safety.html`,
  },
  {
    slug: 'privacy-consent',
    title: '개인정보 수집·이용 안내/동의',
    kind: 'consent',
    isRequired: true,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}privacy.html#purpose`,
  },
  {
    slug: 'sensitive-information-consent',
    title: '민감정보 선택 동의',
    kind: 'consent',
    isRequired: false,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}privacy.html#sensitive`,
  },
  {
    slug: 'contacts-consent',
    title: '연락처 지인 제외 선택 안내',
    kind: 'consent',
    isRequired: false,
    documentUrl: `${LEGAL_PUBLIC_BASE_URL}privacy.html#contacts`,
  },
].map(item => ({
  ...item,
  version: AGREEMENT_VERSION,
  defaultRequired: item.kind === 'consent' ? item.isRequired : false,
}));

async function seedAgreementMetadata(TermsModel) {
  for (const item of AGREEMENT_METADATA) {
    const { documentUrl, ...metadata } = item;
    await TermsModel.updateOne(
      { slug: item.slug, version: item.version },
      {
        $set: {
          ...metadata,
          // Terms 스키마의 기존 content 필드는 공개 본문의 URL 참조만 저장한다.
          content: documentUrl,
          body: '',
          isActive: true,
          effectiveAt: EFFECTIVE_AT,
        },
        $setOnInsert: { publishedAt: EFFECTIVE_AT },
      },
      { upsert: true, runValidators: true },
    );
    await TermsModel.updateMany(
      { slug: item.slug, version: { $ne: item.version }, isActive: true },
      { $set: { isActive: false } },
    );
    console.log(`📌 Ready: ${item.slug} v${item.version} (${item.isRequired ? 'required' : 'optional'})`);
  }
}

async function main() {
  try {
    const { loadEnv } = require('../src/config/loadEnv');
    const { nodeEnv } = loadEnv();
    const mongoUrl = String(process.env.MONGO_URI || '').trim();
    if (!mongoUrl) throw new Error('MONGO_URI가 설정되지 않았습니다.');
    const Terms = require('../src/models/Legal/Terms');
    await mongoose.connect(mongoUrl);
    console.log(`✅ Connected to MongoDB (${nodeEnv})`);
    await seedAgreementMetadata(Terms);
    console.log('🎉 Agreement metadata seed completed');
  } catch (error) {
    console.error('❌ Seed error:', safeErrorDetails(error));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void main();

module.exports = {
  AGREEMENT_METADATA,
  AGREEMENT_VERSION,
  LEGAL_PUBLIC_BASE_URL,
  seedAgreementMetadata,
};
