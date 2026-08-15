#!/usr/bin/env node
/**
 * 이메일 인증 로그인 전환 — username 유니크 인덱스 sparse 전환 마이그레이션
 * ------------------------------------------------------------
 * 배경:
 *  - 이메일 인증 가입자는 username 없이 생성된다(User 스키마에서 username required 해제).
 *  - 기존 users.username_1 인덱스는 "unique: true"만 있고 "sparse: true"가 없어서,
 *    username이 없는(undefined) 문서가 2건 이상 생기면 값이 null로 취급되어
 *    E11000 duplicate key(username: null) 에러로 이메일 가입 자체가 실패한다.
 *  - email_1 인덱스(unique+sparse)는 신규 모델 로드 시 mongoose가 자동 생성하지만,
 *    이미 존재하는 username_1 인덱스는 옵션이 달라도 자동으로 재생성되지 않으므로
 *    반드시 이 스크립트로 한 번 드롭 후 재생성해야 한다.
 *
 * 실행: node scripts/migrations/2026-07-16-username-email-sparse-index.js [--dry-run]
 *
 * 환경변수:
 *  - MONGO_URL (예: mongodb://127.0.0.1:27017/tzchat)
 *
 * 옵션:
 *  --dry-run  실제로 인덱스를 바꾸지 않고 현재 상태만 점검/출력
 *
 * 주의:
 *  - 인덱스 재생성 자체는 되돌릴 수 없는 작업은 아니지만(다시 unique만으로 재생성 가능),
 *    운영 DB에서 실행하기 전에 반드시 --dry-run으로 먼저 확인하세요.
 *  - email_1 인덱스는 User 모델이 로드되는 시점에 mongoose autoIndex로 이미
 *    생성되어 있어야 정상입니다(앱을 한 번이라도 기동했다면 보통 생성되어 있음).
 *    없다면 이 스크립트가 함께 생성합니다.
 */

const path = require('path');
require('module-alias/register');
const mongoose = require('mongoose');

require(path.resolve(__dirname, '../../src/models'));
const { User } = require(path.resolve(__dirname, '../../src/models'));

function parseArgs() {
  const args = process.argv.slice(2);
  return { dryRun: args.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tzchat';

  console.log('────────────────────────────────────────────────────────');
  console.log('🛠  username/email 인덱스 sparse 전환 마이그레이션');
  console.log(`• MONGO_URL : ${mongoUrl}`);
  console.log(`• dry-run   : ${dryRun ? 'YES (미적용)' : 'NO (실제 적용)'}`);
  console.log('────────────────────────────────────────────────────────');

  try {
    await mongoose.connect(mongoUrl, { autoIndex: false });

    const before = await User.collection.indexes();
    const usernameIdx = before.find((i) => i.name === 'username_1');
    const emailIdx = before.find((i) => i.name === 'email_1');

    console.log('🔎 현재 username_1:', usernameIdx ? JSON.stringify(usernameIdx) : '(없음)');
    console.log('🔎 현재 email_1   :', emailIdx ? JSON.stringify(emailIdx) : '(없음)');

    const usernameNeedsFix = !usernameIdx || !usernameIdx.sparse;
    const emailNeedsCreate = !emailIdx;

    if (!usernameNeedsFix && !emailNeedsCreate) {
      console.log('✅ 이미 올바른 상태입니다. 변경할 것이 없습니다.');
      return;
    }

    if (dryRun) {
      if (usernameNeedsFix) console.log('🧪 dry-run: username_1을 드롭 후 {unique:true, sparse:true}로 재생성할 예정입니다.');
      if (emailNeedsCreate) console.log('🧪 dry-run: email_1을 {unique:true, sparse:true}로 생성할 예정입니다.');
      return;
    }

    if (usernameNeedsFix) {
      if (usernameIdx) {
        await User.collection.dropIndex('username_1');
        console.log('🗑  기존 username_1 인덱스 드롭 완료');
      }
      await User.collection.createIndex({ username: 1 }, { unique: true, sparse: true, name: 'username_1' });
      console.log('✅ username_1 인덱스를 {unique:true, sparse:true}로 재생성했습니다.');
    }

    if (emailNeedsCreate) {
      await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
      console.log('✅ email_1 인덱스를 {unique:true, sparse:true}로 생성했습니다.');
    }

    console.log('────────────────────────────────────────────────────────');
    console.log('✅ 마이그레이션 완료');
  } catch (err) {
    console.error('❌ 마이그레이션 중 오류 발생:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main();
}
