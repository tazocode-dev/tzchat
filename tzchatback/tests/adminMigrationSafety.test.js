require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'admin-migration-test-secret';
process.env.SESSION_SECRET ||= 'admin-migration-session-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = require('../src/controllers/admin/betaMigration.controller');
const { executeMigration } = require('../src/services/admin/betaMigrationService');

function recordingResponse() {
  const recorded = { status: 200, body: null };
  return {
    recorded,
    response: {
      status(status) {
        recorded.status = status;
        return this;
      },
      json(body) {
        recorded.body = body;
        return this;
      },
    },
  };
}

test('관리자 beta 전환은 명시적인 boolean dryRun을 DB 호출 전에 요구한다', async () => {
  const invalidBodies = [undefined, {}, { dryRun: null }, { dryRun: 'true' }, { dryRun: 1 }];

  for (const body of invalidBodies) {
    let calls = 0;
    const { recorded, response } = recordingResponse();
    await controller.execute({ body }, response, {
      executeMigration: async () => { calls += 1; },
    });

    assert.equal(recorded.status, 400);
    assert.equal(recorded.body.code, 'INVALID_MIGRATION_MODE');
    assert.equal(recorded.body.message, 'dryRun은 boolean 값이어야 합니다.');
    assert.equal(calls, 0);
  }
});

test('실제 beta 전환은 정확한 확인 문구가 없으면 DB 호출 전에 거부한다', async () => {
  const invalidBodies = [
    { dryRun: false },
    { dryRun: false, confirmation: true },
    { dryRun: false, confirmation: 'beta_to_basic' },
    { dryRun: false, confirmation: ' BETA_TO_BASIC ' },
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const { recorded, response } = recordingResponse();
    await controller.execute({ body }, response, {
      executeMigration: async () => { calls += 1; },
    });

    assert.equal(recorded.status, 400);
    assert.equal(recorded.body.code, 'MIGRATION_CONFIRMATION_REQUIRED');
    assert.match(recorded.body.message, /BETA_TO_BASIC/);
    assert.equal(calls, 0);
  }
});

test('dry-run과 확인된 실제 실행만 서비스에 정확한 모드로 전달한다', async () => {
  for (const expectedDryRun of [true, false]) {
    const calls = [];
    const body = expectedDryRun
      ? { dryRun: true }
      : { dryRun: false, confirmation: controller.BETA_MIGRATION_CONFIRMATION };
    const { recorded, response } = recordingResponse();

    await controller.execute({ body }, response, {
      executeMigration: async (dryRun) => {
        calls.push(dryRun);
        return { dryRun };
      },
    });

    assert.equal(recorded.status, 200);
    assert.deepEqual(calls, [expectedDryRun]);
    assert.equal(recorded.body.dryRun, expectedDryRun);
  }
});

test('서비스의 기본 모드는 DB를 변경하지 않는 dry-run이다', async () => {
  let updates = 0;
  const UserModel = {
    countDocuments: async () => 3,
    updateMany: async () => {
      updates += 1;
      return { matchedCount: 3, modifiedCount: 3 };
    },
  };

  const dryRun = await executeMigration(undefined, { UserModel });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.modified, 0);
  assert.equal(updates, 0);

  const applied = await executeMigration(false, { UserModel });
  assert.equal(applied.dryRun, false);
  assert.equal(applied.modified, 3);
  assert.equal(updates, 1);
});

test('사용하지 않는 migration health와 중복 beta 스크립트가 남지 않는다', () => {
  const router = require('../src/routes/admin/migrationRouter');
  const routePaths = router.stack.filter(layer => layer.route).map(layer => layer.route.path);
  const standaloneScript = path.join(
    __dirname,
    '../scripts/migrations',
    ['2026-12-31', 'beta-to-basic.js'].join('-'),
  );

  assert.equal(routePaths.includes(['/migration', 'health'].join('/')), false);
  assert.equal(Object.hasOwn(controller, 'health'), false);
  assert.equal(fs.existsSync(standaloneScript), false);
});
