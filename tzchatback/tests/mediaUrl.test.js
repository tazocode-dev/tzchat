require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { getPublicBaseUrl, toAbsoluteMediaUrl } = require('@/utils/mediaUrl')

test('공개 미디어 URL은 요청 헤더와 무관하게 PUBLIC_API_ORIGIN만 사용한다', () => {
  const previous = process.env.PUBLIC_API_ORIGIN
  process.env.PUBLIC_API_ORIGIN = 'https://tzchat.tazocode.com'
  try {
    const hostileRequest = {
      headers: {
        forwarded: 'proto=http;host=internal.example:11018',
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'localhost:11018',
      },
      protocol: 'http',
      get: () => '127.0.0.1:11018',
    }

    assert.equal(getPublicBaseUrl(hostileRequest), 'https://tzchat.tazocode.com')
    assert.equal(
      toAbsoluteMediaUrl('/uploads/profile/photo.jpg', hostileRequest),
      'https://tzchat.tazocode.com/uploads/profile/photo.jpg',
    )
    assert.equal(
      toAbsoluteMediaUrl('http://localhost:11018/uploads/chat/photo.jpg', hostileRequest),
      'https://tzchat.tazocode.com/uploads/chat/photo.jpg',
    )
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_API_ORIGIN
    else process.env.PUBLIC_API_ORIGIN = previous
  }
})

test('PUBLIC_API_ORIGIN이 없으면 임의 요청 호스트로 공개 URL을 만들지 않는다', () => {
  const previous = process.env.PUBLIC_API_ORIGIN
  delete process.env.PUBLIC_API_ORIGIN
  try {
    assert.throws(() => getPublicBaseUrl({ headers: {} }), /PUBLIC_API_ORIGIN/)
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_API_ORIGIN
    else process.env.PUBLIC_API_ORIGIN = previous
  }
})
