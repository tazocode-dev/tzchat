const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('사용자 자기 등급 변경 테스트 라우트는 출시 표면에 포함되지 않는다', () => {
  const routesSource = fs.readFileSync(path.join(ROOT, 'src/routes/index.js'), 'utf8');
  const removedModuleName = ['grade', 'Router'].join('');
  const removedEndpoint = ['/api/user', 'grade'].join('/');
  const removedFiles = [
    ['src/routes/public', [removedModuleName, '.js'].join('')],
    ['src/controllers/public', [['grade', 'controller'].join('.'), '.js'].join('')],
    ['src/services/public', [['grade', 'Service'].join(''), '.js'].join('')],
  ];

  assert.equal(routesSource.includes(removedModuleName), false);
  assert.equal(routesSource.includes(removedEndpoint), false);
  for (const fileParts of removedFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, ...fileParts)), false);
  }
});
