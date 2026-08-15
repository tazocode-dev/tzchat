// models/System/Notice.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const NoticeSchema = new Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  category: { type: String, default: '' },
  publishedAt: { type: Date, default: Date.now },
  isPublished: { type: Boolean, default: true },
  author: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

NoticeSchema.index({ publishedAt: -1 });
NoticeSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.models.Notice || mongoose.model('Notice', NoticeSchema);
