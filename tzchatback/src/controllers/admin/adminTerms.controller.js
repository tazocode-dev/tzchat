// src/controllers/admin/adminTerms.controller.js
// ────────────────────────────────────────────────────────────
// 관리자 약관 발행/조회 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/admin/adminTermsService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { AdminTermsError, publishTerms, listTerms } = require('@/services/admin/adminTermsService');

async function create(req, res) {
  try {
    const doc = await publishTerms(req.body);
    return res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    if (err instanceof AdminTermsError) {
      return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.error('[ADMIN/TERMS][POST]', { path: req.baseUrl + req.path, message: err?.message });
    return res.status(500).json({ ok: false, message: err.message });
  }
}

async function list(req, res) {
  try {
    const data = await listTerms(req.query || {});
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[ADMIN/TERMS][GET]', { path: req.baseUrl + req.path, message: err?.message });
    return res.status(500).json({ ok: false, message: err.message });
  }
}

module.exports = { create, list };
