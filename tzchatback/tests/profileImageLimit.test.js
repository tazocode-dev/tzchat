require('module-alias/register')

const { after, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-profile-limit-'))
process.env.UPLOAD_ROOT = uploadRoot
process.env.PUBLIC_API_ORIGIN = 'https://tzchat.example.com'

const {
  MAX_PROFILE_IMAGES,
  PROFILE_IMAGE_LIMIT_MESSAGE,
  uploadImages,
} = require('../src/services/public/imageWriteService')

after(() => {
  fs.rmSync(uploadRoot, { recursive: true, force: true })
})

function incomingFile(name) {
  const filePath = path.join(uploadRoot, name)
  fs.writeFileSync(filePath, 'temporary upload')
  return { path: filePath, originalname: name, mimetype: 'image/jpeg' }
}

function userModel({ images = [], profileMain = '', updateResult = { matchedCount: 1 }, onUpdate = () => {} } = {}) {
  return {
    findById() {
      return { lean: async () => ({ _id: 'user-1', profileImages: images, profileMain }) }
    },
    async updateOne(filter, update, options) {
      onUpdate(filter, update, options)
      return updateResult
    },
  }
}

async function fakeVariants(srcPath, baseNoExt) {
  const variants = {
    thumb: `${baseNoExt}_thumb.jpg`,
    medium: `${baseNoExt}_medium.jpg`,
    full: `${baseNoExt}_full.jpg`,
  }
  for (const variantPath of Object.values(variants)) fs.writeFileSync(variantPath, fs.readFileSync(srcPath))
  return variants
}

test('기존 수와 요청 파일 수가 2장을 넘으면 처리·DB 쓰기 전에 거부하고 임시 파일을 삭제한다', async () => {
  assert.equal(MAX_PROFILE_IMAGES, 2)
  const file = incomingFile('over-limit.jpg')
  let variantCalls = 0
  let updateCalls = 0

  await assert.rejects(
    uploadImages({ myId: 'user-1', kind: 'gallery', files: [file], req: {} }, {
      UserModel: userModel({
        images: [{ id: 'one' }, { id: 'two' }],
        onUpdate: () => { updateCalls += 1 },
      }),
      createVariantsAndSave: async () => { variantCalls += 1 },
    }),
    error => error.status === 400 && error.message === PROFILE_IMAGE_LIMIT_MESSAGE,
  )

  assert.equal(variantCalls, 0)
  assert.equal(updateCalls, 0)
  assert.equal(fs.existsSync(file.path), false)
})

test('최종 DB 조건은 현재 배열 길이를 제한해 동시 요청의 3번째 사진을 막는다', async () => {
  const file = incomingFile('race.jpg')
  let updateFilter = null

  await assert.rejects(
    uploadImages({ myId: 'user-1', kind: 'gallery', files: [file], req: {} }, {
      UserModel: userModel({
        images: [{ id: 'one' }],
        updateResult: { matchedCount: 0 },
        onUpdate: filter => { updateFilter = filter },
      }),
      createVariantsAndSave: fakeVariants,
      inspectImageFile: async () => {},
    }),
    error => error.status === 409 && error.message === PROFILE_IMAGE_LIMIT_MESSAGE,
  )

  assert.deepEqual(updateFilter['profileImages.1'], { $exists: false })
  assert.equal(fs.existsSync(file.path), false)
  const generated = fs.readdirSync(path.join(uploadRoot, 'profile', 'user-1'))
    .filter(name => name.endsWith('.jpg'))
  assert.deepEqual(generated, [])
})

test('2장 이하 업로드는 조건부 update로 저장하고 생성 결과를 반환한다', async () => {
  const files = [incomingFile('first.jpg'), incomingFile('second.jpg')]
  let updateFilter = null
  let pushed = null

  const result = await uploadImages({ myId: 'user-1', kind: 'avatar', files, req: {} }, {
    UserModel: userModel({
      onUpdate(filter, update) {
        updateFilter = filter
        pushed = update.$push.profileImages.$each
      },
    }),
    createVariantsAndSave: fakeVariants,
    inspectImageFile: async () => {},
  })

  assert.deepEqual(updateFilter['profileImages.0'], { $exists: false })
  assert.equal(pushed.length, 2)
  assert.equal(result.created.length, 2)
  assert.equal(files.every(file => !fs.existsSync(file.path)), true)
})
