#!/usr/bin/env node
/**
 * master 역할 승격 스크립트
 *
 * 기본 동작은 대상과 현재 역할만 확인하는 dry-run이다. 실제 변경은 apply=1을
 * 명시한 경우에만 수행한다. 연결에는 MONGO_URI 환경변수만 사용한다.
 *
 * 사용법:
 *   node scripts/promoteMaster.js username=<username>
 *   node scripts/promoteMaster.js email=<email> apply=1
 *   node scripts/promoteMaster.js userId=<ObjectId> apply=1
 */

require('module-alias/register');

const mongoose = require('mongoose');
const { User } = require('../src/models');
const { requireMongoUri, redactMongoUri, safeErrorDetails } = require('./scriptSafety');

const SELECTOR_KEYS = new Set(['username', 'email', 'userId']);
const ALLOWED_KEYS = new Set([...SELECTOR_KEYS, 'apply']);

function promotionArgumentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parsePromotionArgs(args = process.argv.slice(2), mongooseClient = mongoose) {
  const parsed = {};
  for (const arg of args) {
    const separator = arg.indexOf('=');
    if (separator <= 0) {
      throw promotionArgumentError(
        'INVALID_PROMOTION_ARGUMENT',
        '인자는 key=value 형식이어야 합니다.',
      );
    }
    const key = arg.slice(0, separator);
    const value = arg.slice(separator + 1).trim();
    if (!ALLOWED_KEYS.has(key) || Object.hasOwn(parsed, key) || !value) {
      throw promotionArgumentError(
        'INVALID_PROMOTION_ARGUMENT',
        '지원하지 않거나 중복된 승격 인자가 있습니다.',
      );
    }
    parsed[key] = value;
  }

  const selectors = [...SELECTOR_KEYS].filter((key) => Object.hasOwn(parsed, key));
  if (selectors.length !== 1) {
    throw promotionArgumentError(
      'INVALID_PROMOTION_SELECTOR',
      'username, email, userId 중 하나의 대상만 지정해야 합니다.',
    );
  }
  if (Object.hasOwn(parsed, 'apply') && parsed.apply !== '1') {
    throw promotionArgumentError(
      'INVALID_PROMOTION_APPLY',
      '실제 승격은 apply=1로만 요청할 수 있습니다.',
    );
  }

  const selectorType = selectors[0];
  const selectorValue = parsed[selectorType];
  if (selectorType === 'username' && selectorValue.length > 128) {
    throw promotionArgumentError('INVALID_PROMOTION_SELECTOR', 'username 형식이 올바르지 않습니다.');
  }
  if (
    selectorType === 'email'
    && (selectorValue.length > 254 || !selectorValue.includes('@'))
  ) {
    throw promotionArgumentError('INVALID_PROMOTION_SELECTOR', 'email 형식이 올바르지 않습니다.');
  }
  if (selectorType === 'userId' && !mongooseClient.Types.ObjectId.isValid(selectorValue)) {
    throw promotionArgumentError('INVALID_PROMOTION_SELECTOR', 'userId 형식이 올바르지 않습니다.');
  }

  const field = selectorType === 'userId' ? '_id' : selectorType;
  const normalizedValue = selectorType === 'email' ? selectorValue.toLowerCase() : selectorValue;
  return {
    apply: parsed.apply === '1',
    selector: { [field]: normalizedValue },
    selectorType,
  };
}

function safePromotionError(error) {
  const details = safeErrorDetails(error);
  const expectedCodes = new Set([
    'INVALID_PROMOTION_ARGUMENT',
    'INVALID_PROMOTION_SELECTOR',
    'INVALID_PROMOTION_APPLY',
    'MONGO_URI_REQUIRED',
    'PROMOTION_TARGET_NOT_FOUND',
  ]);
  if (expectedCodes.has(details.code)) return details;
  return {
    name: details.name,
    code: details.code,
    message: 'master 승격 작업을 완료하지 못했습니다.',
  };
}

async function main(options = {}) {
  const logger = options.logger || console;
  const mongooseClient = options.mongooseClient || mongoose;
  const UserModel = options.UserModel || User;
  let connected = false;

  try {
    const request = parsePromotionArgs(options.args, mongooseClient);
    const mongoUri = requireMongoUri(options.env || process.env);

    logger.log('[promote-master] target', redactMongoUri(mongoUri));
    logger.log('[promote-master] mode', request.apply ? 'apply' : 'dry-run');
    logger.log('[promote-master] selector', request.selectorType);

    await mongooseClient.connect(mongoUri);
    connected = true;

    const user = await UserModel.findOne(request.selector).select('_id role').lean();
    if (!user) {
      throw promotionArgumentError(
        'PROMOTION_TARGET_NOT_FOUND',
        '승격 대상을 찾을 수 없습니다.',
      );
    }

    logger.log('[promote-master] current role', user.role || null);
    if (!request.apply) {
      logger.log('[promote-master] dry-run completed; no user changes were made');
      return { ok: true, applied: false };
    }

    const result = await UserModel.updateOne(
      { _id: user._id },
      { $set: { role: 'master' } },
    );
    logger.log('[promote-master] applied', {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
    });
    return { ok: true, applied: true };
  } catch (error) {
    const diagnostic = safePromotionError(error);
    logger.error('[promote-master] failed', diagnostic);
    return { ok: false, error: diagnostic };
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
  parsePromotionArgs,
  safePromotionError,
};
