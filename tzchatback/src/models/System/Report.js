const mongoose = require('mongoose');
const retention = require('@/config/retention');

const { Schema } = mongoose;

const REPORT_REASONS = [
  'inappropriate_profile',
  'sexual_content',
  'harassment',
  'impersonation',
  'spam',
  'other',
];
const REPORT_CONTEXT_TYPES = ['profile', 'chat'];
const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'rejected'];

const reportSchema = new Schema(
  {
    reporterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    contextType: { type: String, enum: REPORT_CONTEXT_TYPES, required: true },
    chatRoomId: { type: Schema.Types.ObjectId, ref: 'ChatRoom', default: null },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => {
        const days = retention?.COMPLAINT_DAYS ?? 1095;
        return new Date(Date.now() + days * 86400000);
      },
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedUserId: 1, status: 1, createdAt: -1 });
reportSchema.index(
  { reporterUserId: 1, reportedUserId: 1, contextType: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'unique_pending_report_context',
  }
);

reportSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Report = mongoose.model('Report', reportSchema);

Report.REPORT_REASONS = REPORT_REASONS;
Report.REPORT_CONTEXT_TYPES = REPORT_CONTEXT_TYPES;
Report.REPORT_STATUSES = REPORT_STATUSES;

module.exports = Report;
