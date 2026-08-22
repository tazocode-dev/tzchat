const { ReportError, createReport } = require('@/services/system/reportService');

function getUserId(req) {
  return String(req?.user?._id || req?._uid || req?.session?.user?._id || '');
}

async function create(req, res) {
  try {
    const report = await createReport(getUserId(req), req.body || {});
    return res.status(201).json({ ok: true, report });
  } catch (error) {
    if (error instanceof ReportError) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    console.error('[reports][ERR] create', { message: error?.message });
    return res.status(500).json({ ok: false, message: '신고를 접수하지 못했습니다.' });
  }
}

module.exports = { create };
