// /scripts/seedTerms.js
// 실행: node scripts/seedTerms.js
// - Mongo 연결 env 통일: MONGODB_URI > MONGO_URI > MONGO_URL > 기본값
// - 스키마 일관화: version 'YYYY-MM-DD-01' 형태, kind: 'page', required 필드 제거

const mongoose = require('mongoose');
const Terms = require('../models/Legal/Terms');

function todayVersion(seq = '01') {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}-${seq}`;
}

(async () => {
  try {
    const mongoUrl =
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      process.env.MONGO_URL ||
      'mongodb://localhost:27017/tzchat';

    await mongoose.connect(mongoUrl);
    console.log(`✅ Connected to MongoDB: ${mongoUrl}`);

    // 초기 시드 데이터 (page 문서)
    const seedDocs = [
      {
        slug: 'privacy',
        title: '개인정보 처리방침',
        version: todayVersion('01'), // 예: 2025-10-02-01
        kind: 'page',                // page/consent 구분 추가
        isActive: true,
        content: `
          <h1>개인정보 처리방침</h1>
          <p>본 방침은 서비스 제공을 위해 개인정보를 어떻게 수집, 이용, 보관하는지 설명합니다.</p>
          <ul>
            <li>수집 항목: 이메일, 닉네임, 기기 정보</li>
            <li>이용 목적: 회원 관리, 서비스 제공, 보안</li>
            <li>보관 기간: 회원 탈퇴 시 즉시 삭제</li>
          </ul>
        `,
      },
      {
        slug: 'terms',
        title: '서비스 이용약관',
        version: todayVersion('01'),
        kind: 'page',
        isActive: true,
        content: `
          <h1>서비스 이용약관</h1>
          <p>본 약관은 회원과 회사 간의 권리와 의무, 서비스 이용 조건을 규정합니다.</p>
          <ul>
            <li>회원은 법령과 본 약관을 준수해야 합니다.</li>
            <li>회사는 안정적인 서비스 제공을 위해 최선을 다합니다.</li>
            <li>회원이 약관을 위반할 경우 서비스 이용이 제한될 수 있습니다.</li>
          </ul>
        `,
      },
    ];

    for (const doc of seedDocs) {
      // 기존 동일 slug 활성본 비활성화
      await Terms.updateMany({ slug: doc.slug, isActive: true }, { $set: { isActive: false } });
      // 새 버전 생성
      const created = await Terms.create(doc);
      console.log(`📌 Seeded: ${created.slug} v${created.version} (kind=${created.kind})`);
    }

    console.log('🎉 Seed completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
})();
