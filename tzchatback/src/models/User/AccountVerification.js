const mongoose = require('mongoose');
const { Schema } = mongoose;

const AccountVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    purpose: {
      type: String,
      enum: [
        'email_verify_new',
        'email_change_current',
        'email_change_new',
        'phone_change_email',
        'phone_change_sms',
        'public_phone_change_email',
        'public_phone_change_sms',
      ],
      required: true,
    },
    destination: { type: String, required: true, trim: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

AccountVerificationSchema.index({ userId: 1, purpose: 1, destination: 1, createdAt: -1 });
AccountVerificationSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model('AccountVerification', AccountVerificationSchema);
