// models/System/Notice.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const NoticeSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  content: { type: String, required: true, trim: true, maxlength: 50000 },
  category: { type: String, trim: true, maxlength: 40, default: '' },
  publishedAt: { type: Date, default: Date.now },
  isPublished: { type: Boolean, default: true },
  author: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

NoticeSchema.index({ publishedAt: -1 });
NoticeSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.models.Notice || mongoose.model('Notice', NoticeSchema);
