const {
  ReportError,
  listReports,
  updateReportStatus,
} = require('@/services/system/reportService');

function getAdminId(req) {
  return String(req?.user?._id || '');
}

function handleError(res, error, operation) {
  if (error instanceof ReportError) {
    return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  }
  console.error(`[admin:reports][ERR] ${operation}`, { message: error?.message });
  return res.status(500).json({ ok: false, message: '신고 관리 요청을 처리하지 못했습니다.' });
}

async function list(req, res) {
  try {
    return res.json({ ok: true, ...(await listReports(req.query || {})) });
  } catch (error) {
    return handleError(res, error, 'list');
  }
}

async function updateStatus(req, res) {
  try {
    const report = await updateReportStatus(req.params.id, getAdminId(req), req.body || {});
    return res.json({ ok: true, report });
  } catch (error) {
    return handleError(res, error, 'updateStatus');
  }
}

module.exports = { list, updateStatus };
