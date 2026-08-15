// lib/response.js
// -------------------------------------------------------------
// 공통 API 응답 포맷 (지침 §4).
// 기존 라우트 대부분은 {ok:...} 또는 {success:...} 등 제각각의 모양을 쓰고 있다.
// 이 헬퍼는 신규/수정 라우트부터 점진적으로 적용하기 위한 공통 진실원이며,
// 기존 라우트를 일괄 치환하지는 않는다(별도 마이그레이션 필요 - 지침 위반 항목으로 별도 기록됨).
// -------------------------------------------------------------

function ok(res, data = null, { meta = null, message = null, status = 200 } = {}) {
  return res.status(status).json({ success: true, data, meta, message });
}

function fail(res, status, code, message, details = null) {
  return res.status(status).json({ success: false, error: { code, message, details } });
}

module.exports = { ok, fail };
