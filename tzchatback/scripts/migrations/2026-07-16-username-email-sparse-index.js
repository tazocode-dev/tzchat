#!/usr/bin/env node
/**
 * username/email sparse 인덱스 호환 마이그레이션
 *
 * 과거 이메일 가입 도입 당시 username 없는 계정을 허용하기 위해 만든 일회성
 * 호환 작업이다. 기본 실행은 현재 상태만 확인하고, 실제 변경은 --apply가 있을
 * 때만 수행한다.
 *
 * 사용법:
 *   node scripts/migrations/2026-07-16-username-email-sparse-index.js
 *   node scripts/migrations/2026-07-16-username-email-sparse-index.js --apply
 *
 * 환경변수:
 *   MONGO_URI (필수)
 */

require('module-alias/register');

const mongoose = require('mongoose');
const { User } = require('../../src/models');
const {
  redactMongoUri,
  requireMongoUri,
  safeErrorDetails,
} = require('../scriptSafety');

function migrationArgumentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseMigrationArgs(args = process.argv.slice(2)) {
  const allowed = new Set(['--dry-run', '--apply']);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) {
    throw migrationArgumentError(
      'INVALID_MIGRATION_ARGUMENT',
      '지원하지 않는 실행 인자가 있습니다. --apply 또는 --dry-run만 사용할 수 있습니다.',
    );
  }
  if (new Set(args).size !== args.length) {
    throw migrationArgumentError(
      'DUPLICATE_MIGRATION_ARGUMENT',
      '같은 실행 인자를 중복해서 사용할 수 없습니다.',
    );
  }
  if (args.includes('--apply') && args.includes('--dry-run')) {
    throw migrationArgumentError(
      'MIGRATION_ARGUMENT_CONFLICT',
      '--apply와 --dry-run은 함께 사용할 수 없습니다.',
    );
  }

  const apply = args.includes('--apply');
  return { apply, dryRun: !apply };
}

async function main(options = {}) {
  const logger = options.logger || console;
  const mongooseClient = options.mongooseClient || mongoose;
  const UserModel = options.UserModel || User;
  let connected = false;

  try {
    const mode = parseMigrationArgs(options.args);
    const mongoUri = requireMongoUri(options.env || process.env);

    logger.log('[username-email-index] target', redactMongoUri(mongoUri));
    logger.log('[username-email-index] mode', mode.dryRun ? 'dry-run' : 'apply');

    await mongooseClient.connect(mongoUri, { autoIndex: false });
    connected = true;

    const indexes = await UserModel.collection.indexes();
    const usernameIndex = indexes.find((index) => index.name === 'username_1');
    const emailIndex = indexes.find((index) => index.name === 'email_1');
    const usernameNeedsFix = !usernameIndex || usernameIndex.sparse !== true;
    const emailNeedsCreate = !emailIndex;

    logger.log('[username-email-index] inspection', {
      usernameNeedsFix,
      emailNeedsCreate,
    });

    if (!usernameNeedsFix && !emailNeedsCreate) {
      logger.log('[username-email-index] no changes required');
      return { ok: true, applied: false, usernameNeedsFix, emailNeedsCreate };
    }

    if (mode.dryRun) {
      logger.log('[username-email-index] dry-run completed; no index changes were made');
      return { ok: true, applied: false, usernameNeedsFix, emailNeedsCreate };
    }

    if (usernameNeedsFix) {
      if (usernameIndex) await UserModel.collection.dropIndex('username_1');
      await UserModel.collection.createIndex(
        { username: 1 },
        { unique: true, sparse: true, name: 'username_1' },
      );
    }
    if (emailNeedsCreate) {
      await UserModel.collection.createIndex(
        { email: 1 },
        { unique: true, sparse: true, name: 'email_1' },
      );
    }

    logger.log('[username-email-index] migration applied');
    return { ok: true, applied: true, usernameNeedsFix, emailNeedsCreate };
  } catch (error) {
    logger.error('[username-email-index] failed', safeErrorDetails(error));
    return { ok: false, error: safeErrorDetails(error) };
  } finally {
    if (connected) {
      await mongooseClient.disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  void main().then((result) => {
    if (!result.ok) process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseMigrationArgs,
};
