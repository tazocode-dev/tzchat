// server/models/Payment/Payment.js
const mongoose = require('mongoose');
const retention = require('@/config/retention');

const PaymentSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  provider: { type: String, index: true },  // e.g., 'stripe' / 'inicis' / 'kcp'
  amount:   { type: Number },
  currency: { type: String, default: 'KRW' },
  status:   { type: String, index: true },  // 'paid' | 'refunded' | ...
  meta:     { type: Object },
  createdAt:{ type: Date, default: Date.now, index: true },
  expiresAt:{ type: Date, index: { expires: 0 } }, // 5년 뒤 만료
});

PaymentSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + retention.PAYMENT_DAYS * 86400000);
  }
  next();
});

module.exports = mongoose.model('Payment', PaymentSchema);
