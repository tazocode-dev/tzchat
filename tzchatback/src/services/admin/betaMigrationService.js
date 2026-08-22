// src/services/admin/betaMigrationService.js
// ────────────────────────────────────────────────────────────
// 베타→일반회원 일괄 전환 도메인 서비스.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');

const BETA = '베타회원';
const BASIC = '일반회원';

// 날짜 문자열(Asia/Seoul 표기용 단순 헬퍼)
function nowKstISO() {
  const now = new Date();
  const tzOffset = 9 * 60; // +09:00
  const kst = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  const y = kst.getFullYear();
  const m = pad(kst.getMonth() + 1);
  const d = pad(kst.getDate());
  const hh = pad(kst.getHours());
  const mm = pad(kst.getMinutes());
  const ss = pad(kst.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`;
}

async function previewMigration(dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const total = await UserModel.countDocuments({ user_level: BETA });
  return { ts: nowKstISO(), targetLevelFrom: BETA, targetLevelTo: BASIC, total, dryRun: true };
}

async function executeMigration(dryRun = true, dependencies = {}) {
  const safeDryRun = dryRun !== false;
  const UserModel = dependencies.UserModel || User;
  const match = { user_level: BETA };
  const total = await UserModel.countDocuments(match);

  if (total === 0) {
    return {
      ts: nowKstISO(), targetLevelFrom: BETA, targetLevelTo: BASIC,
      total, matched: 0, modified: 0, dryRun: safeDryRun, note: '변경 대상이 없습니다.',
    };
  }

  if (safeDryRun) {
    return {
      ts: nowKstISO(), targetLevelFrom: BETA, targetLevelTo: BASIC,
      total, matched: total, modified: 0, dryRun: true,
      note: 'dry-run이므로 DB 업데이트는 수행하지 않았습니다.',
    };
  }

  const now = new Date();
  const result = await UserModel.updateMany(match, { $set: { user_level: BASIC, updatedAt: now } });

  const matched = result.matchedCount ?? result.nMatched ?? 0;
  const modified = result.modifiedCount ?? result.nModified ?? 0;

  return {
    ts: nowKstISO(), targetLevelFrom: BETA, targetLevelTo: BASIC,
    total, matched, modified, dryRun: false, note: '베타 → 일반 회원 일괄 전환 완료',
  };
}

module.exports = { previewMigration, executeMigration };
