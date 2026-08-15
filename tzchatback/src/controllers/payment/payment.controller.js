// src/controllers/payment/payment.controller.js
// ────────────────────────────────────────────────────────────
// 결제(임시/인앱결제 도입 전) 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/payment/paymentService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { PaymentError, purchase, getPurchaseHistory, getHealth } = require('@/services/payment/paymentService');

async function postPurchase(req, res) {
  try {
    const { userId, planCode, gender } = req.body || {};
    const result = await purchase({ userId, planCode, gender });
    return res.json({ ok: true, message: '임시 결제가 완료되었습니다.', ...result });
  } catch (err) {
    if (err instanceof PaymentError) {
      return res.status(err.status).json({ ok: false, error: err.code });
    }
    console.error('[payment/purchase] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

async function purchaseHistory(req, res) {
  try {
    const { userId } = req.query;
    const orders = await getPurchaseHistory(userId);
    return res.json({ ok: true, count: orders.length, orders });
  } catch (err) {
    if (err instanceof PaymentError) {
      return res.status(err.status).json({ ok: false, error: err.code });
    }
    console.error('[payment/history] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

function health(req, res) {
  res.json({ ok: true, ...getHealth() });
}

module.exports = { postPurchase, purchaseHistory, health };
