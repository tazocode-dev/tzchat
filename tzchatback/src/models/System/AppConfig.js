// models/System/AppConfig.js
const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g., 'EMERGENCY_DURATION'
  value: { type: mongoose.Schema.Types.Mixed, required: true } // number/string/object
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', appConfigSchema);
