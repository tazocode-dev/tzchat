require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  redactMongoUri,
  requireMongoUri,
  safeErrorDetails,
} = require('../scripts/scriptSafety');
const sparseIndex = require('../scripts/migrations/2026-07-16-username-email-sparse-index');
const promoteMaster = require('../scripts/promoteMaster');

function recordingLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      log: (...args) => entries.push(args),
      error: (...args) => entries.push(args),
    },
  };
}

function fakeMongoose() {
  return {
    Types: { ObjectId: { isValid: value => /^[a-f\d]{24}$/i.test(value) } },
    connect: async () => {},
    disconnect: async () => {},
  };
}

test('공통 스크립트 진단은 MongoDB URI를 노출하지 않고 MONGO_URI만 요구한다', () => {
  const uri = 'mongodb://operator:secret@db.example.test/tzchat?token=private';
  assert.equal(redactMongoUri(uri), 'mongodb://[redacted]');
  assert.equal(safeErrorDetails(new Error(`failed ${uri}`)).message.includes('secret'), false);
  assert.equal(requireMongoUri({ MONGO_URI: uri }), uri);
  assert.throws(
    () => requireMongoUri({ MONGO_URL: uri }),
    error => error.code === 'MONGO_URI_REQUIRED',
  );
});

test('sparse index 인자는 기본 dry-run이고 apply 충돌·미지원 인자를 거부한다', () => {
  assert.deepEqual(sparseIndex.parseMigrationArgs([]), { apply: false, dryRun: true });
  assert.deepEqual(sparseIndex.parseMigrationArgs(['--dry-run']), { apply: false, dryRun: true });
  assert.deepEqual(sparseIndex.parseMigrationArgs(['--apply']), { apply: true, dryRun: false });
  assert.throws(
    () => sparseIndex.parseMigrationArgs(['--apply', '--dry-run']),
    error => error.code === 'MIGRATION_ARGUMENT_CONFLICT',
  );
  assert.throws(
    () => sparseIndex.parseMigrationArgs(['--force']),
    error => error.code === 'INVALID_MIGRATION_ARGUMENT',
  );
  assert.throws(
    () => sparseIndex.parseMigrationArgs(['--apply', '--apply']),
    error => error.code === 'DUPLICATE_MIGRATION_ARGUMENT',
  );
});

test('sparse index 기본 실행은 변경하지 않고 --apply만 인덱스를 변경한다', async () => {
  const secretUri = 'mongodb://operator:secret@db.example.test/tzchat';
  const mutations = [];
  const UserModel = {
    collection: {
      indexes: async () => [{ name: 'username_1', unique: true }],
      dropIndex: async name => mutations.push(['drop', name]),
      createIndex: async (keys, options) => mutations.push(['create', keys, options]),
    },
  };

  const dryLog = recordingLogger();
  const dryResult = await sparseIndex.main({
    args: [],
    env: { MONGO_URI: secretUri },
    logger: dryLog.logger,
    mongooseClient: fakeMongoose(),
    UserModel,
  });
  assert.equal(dryResult.ok, true);
  assert.equal(dryResult.applied, false);
  assert.deepEqual(mutations, []);
  assert.equal(JSON.stringify(dryLog.entries).includes('secret'), false);

  const applied = await sparseIndex.main({
    args: ['--apply'],
    env: { MONGO_URI: secretUri },
    logger: recordingLogger().logger,
    mongooseClient: fakeMongoose(),
    UserModel,
  });
  assert.equal(applied.applied, true);
  assert.equal(mutations.filter(([operation]) => operation === 'drop').length, 1);
  assert.equal(mutations.filter(([operation]) => operation === 'create').length, 2);
});

test('master 승격 인자는 정확히 하나의 대상과 apply=1만 허용한다', () => {
  const client = fakeMongoose();
  assert.equal(
    promoteMaster.parsePromotionArgs(['email=OWNER@EXAMPLE.TEST'], client).selector.email,
    'owner@example.test',
  );
  assert.equal(promoteMaster.parsePromotionArgs(['username=owner'], client).apply, false);
  assert.equal(
    promoteMaster.parsePromotionArgs(['userId=0123456789abcdef01234567', 'apply=1'], client).apply,
    true,
  );
  assert.throws(
    () => promoteMaster.parsePromotionArgs([], client),
    error => error.code === 'INVALID_PROMOTION_SELECTOR',
  );
  assert.throws(
    () => promoteMaster.parsePromotionArgs(['username=a', 'email=a@example.test'], client),
    error => error.code === 'INVALID_PROMOTION_SELECTOR',
  );
  assert.throws(
    () => promoteMaster.parsePromotionArgs(['username=a', 'apply=true'], client),
    error => error.code === 'INVALID_PROMOTION_APPLY',
  );
  assert.throws(
    () => promoteMaster.parsePromotionArgs(['username=a', 'role=admin'], client),
    error => error.code === 'INVALID_PROMOTION_ARGUMENT',
  );
});

test('master 승격 기본 실행은 쓰지 않고 apply=1은 role 필드만 변경한다', async () => {
  const secretUri = 'mongodb://operator:secret@db.example.test/tzchat';
  const writes = [];
  const selectors = [];
  const UserModel = {
    findOne(selector) {
      selectors.push(selector);
      return {
        select() {
          return { lean: async () => ({ _id: 'internal-id', role: 'user' }) };
        },
      };
    },
    updateOne: async (selector, update) => {
      writes.push({ selector, update });
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  const dryLog = recordingLogger();
  const dryRun = await promoteMaster.main({
    args: ['email=owner@example.test'],
    env: { MONGO_URI: secretUri },
    logger: dryLog.logger,
    mongooseClient: fakeMongoose(),
    UserModel,
  });
  assert.deepEqual(dryRun, { ok: true, applied: false });
  assert.equal(writes.length, 0);
  const serializedLog = JSON.stringify(dryLog.entries);
  assert.equal(serializedLog.includes('secret'), false);
  assert.equal(serializedLog.includes('owner@example.test'), false);

  const applied = await promoteMaster.main({
    args: ['username=owner', 'apply=1'],
    env: { MONGO_URI: secretUri },
    logger: recordingLogger().logger,
    mongooseClient: fakeMongoose(),
    UserModel,
  });
  assert.deepEqual(applied, { ok: true, applied: true });
  assert.equal(selectors.length, 2);
  assert.deepEqual(writes, [
    { selector: { _id: 'internal-id' }, update: { $set: { role: 'master' } } },
  ]);
});

test('운영 스크립트는 import 시 종료하지 않고 seed 오류는 안전한 진단만 기록한다', () => {
  const promoteSource = fs.readFileSync(
    path.join(__dirname, '../scripts/promoteMaster.js'),
    'utf8',
  );
  const seedSource = fs.readFileSync(path.join(__dirname, '../scripts/seedTerms.js'), 'utf8');

  assert.equal(/process\.exit\s*\(/.test(promoteSource), false);
  assert.match(promoteSource, /if \(require\.main === module\)/);
  assert.match(seedSource, /safeErrorDetails\(error\)/);
  assert.equal(/console\.error\([^\n]*,\s*error\s*\)/.test(seedSource), false);
});

test('출시 저장소 메타데이터와 제거된 빈 소스 구조를 유지한다', () => {
  const repositoryRoot = path.join(__dirname, '../..');
  const backendPackage = require('../package.json');
  const frontendPackage = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'tzchatapp/package.json'), 'utf8'),
  );
  const frontendLock = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'tzchatapp/package-lock.json'), 'utf8'),
  );
  const removedDirectories = [
    'tzchatapp/src/features/auth/services',
    'tzchatapp/src/features/legal/txt',
    'tzchatapp/src/legalpage',
    'tzchatapp/tests/e2e',
    'tzchatback/src/controllers/debug',
    'tzchatback/src/controllers/pass',
    'tzchatback/src/models/Admin',
    'tzchatback/src/models/Pass',
    'tzchatback/src/models/logs',
    'tzchatback/src/routes/debug',
    'tzchatback/src/routes/pass',
    'tzchatback/src/services/debug',
    'tzchatback/src/services/pass',
  ];

  assert.equal(backendPackage.private, true);
  assert.match(backendPackage.description, /TZChat/);
  assert.equal(frontendPackage.engines.node, '>=22');
  assert.equal(frontendLock.packages[''].engines.node, '>=22');
  for (const relativePath of removedDirectories) {
    assert.equal(fs.existsSync(path.join(repositoryRoot, relativePath)), false, relativePath);
  }
});
