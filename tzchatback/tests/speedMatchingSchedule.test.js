require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSpeedMatchingAvailability,
  getSpeedMatchingAvailabilityForEmail,
  computeSessionRemaining,
} = require('../src/config/emergency');
const { turnOn } = require('../src/services/search/emergencyModeService');

function kstMs(isoWithoutZone) {
  return new Date(`${isoWithoutZone}+09:00`).getTime();
}

test('스피드 매칭은 매일 13~15시와 21~23시에 시작할 수 있다', () => {
  const daytime = getSpeedMatchingAvailability(kstMs('2026-07-29T13:00:00'));
  assert.equal(daytime.isOpen, true);
  assert.equal(daytime.currentWindow.slotKey, '20260729:day');

  const night = getSpeedMatchingAvailability(kstMs('2026-07-29T22:59:59'));
  assert.equal(night.isOpen, true);
  assert.equal(night.currentWindow.slotKey, '20260729:night');
});

test('종료 시각에는 신규 시작을 닫고 다음 시작 시각을 안내한다', () => {
  const afterDay = getSpeedMatchingAvailability(kstMs('2026-07-29T15:00:00'));
  assert.equal(afterDay.isOpen, false);
  assert.equal(afterDay.nextStartsAt.toISOString(), '2026-07-29T12:00:00.000Z');

  const afterNight = getSpeedMatchingAvailability(kstMs('2026-07-29T23:00:00'));
  assert.equal(afterNight.isOpen, false);
  assert.equal(afterNight.nextStartsAt.toISOString(), '2026-07-30T04:00:00.000Z');
});

test('숨김 여부와 관계없이 고정 종료 시각을 기준으로 남은 시간을 계산한다', () => {
  const now = kstMs('2026-07-29T13:20:00');
  const emergency = {
    isActive: false,
    activatedAt: new Date(kstMs('2026-07-29T13:10:00')),
    expiresAt: new Date(kstMs('2026-07-29T14:10:00')),
  };
  assert.equal(computeSessionRemaining(emergency, now), 50 * 60);
});

test('지정 테스트 계정은 일반 운영 시간 밖에서도 스피드 매칭을 시작할 수 있다', () => {
  const closedTime = kstMs('2026-07-29T10:00:00');
  const testAvailability = getSpeedMatchingAvailabilityForEmail(' TEST3@TAZOCODE.COM ', closedTime);
  assert.equal(testAvailability.isOpen, true);
  assert.equal(testAvailability.testAccount, true);
  assert.equal(testAvailability.currentWindow.slotKey, 'test:test3@tazocode.com');

  const normalAvailability = getSpeedMatchingAvailabilityForEmail('normal@example.com', closedTime);
  assert.equal(normalAvailability.isOpen, false);
  assert.equal(normalAvailability.testAccount, undefined);
});

test('테스트 계정은 이전 1시간 세션이 만료된 후 운영 시간 밖에서도 다시 시작한다', async () => {
  const now = new Date(kstMs('2026-07-29T10:00:00'));
  const updates = [];
  const user = {
    email: 'test2@tazocode.com',
    emergency: {
      isActive: false,
      activatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      slotKey: 'test:test2@tazocode.com',
    },
  };
  const UserModel = {
    findById() {
      return {
        select() { return this; },
        lean() { return Promise.resolve(user); },
      };
    },
    async findByIdAndUpdate(userId, update) {
      updates.push({ userId, update });
    },
  };

  const result = await turnOn('test-user-id', { UserModel, now });
  assert.equal(result.isActive, true);
  assert.equal(result.resumed, false);
  assert.equal(result.remainingSeconds, 3600);
  assert.equal(result.availability.testAccount, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.$set['emergency.slotKey'], 'test:test2@tazocode.com');
});
