const mongoose = require('mongoose');
const { Schema } = mongoose;

const PhoneVerificationSchema = new Schema(
  {
    phone: { type: String, required: true, trim: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

PhoneVerificationSchema.index({ phone: 1, createdAt: -1 });
PhoneVerificationSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model('PhoneVerification', PhoneVerificationSchema);
