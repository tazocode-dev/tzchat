// src/config/database.js
// -------------------------------------------------------------
// MongoDB 연결. main.js에서 분리(지침: server.js/app.js 관심사 분리).
// -------------------------------------------------------------
const mongoose = require('mongoose');

function maskMongoUri(uri) {
  return String(uri || '').replace(/\/\/([^@/]+)@/, '//***:***@');
}

async function connectDatabase() {
  const MONGO_URI = process.env.MONGO_URI;
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB 연결 성공:', maskMongoUri(MONGO_URI));
  require('@/models'); // index.js에서 모든 모델을 로드
}

module.exports = { connectDatabase, maskMongoUri };
