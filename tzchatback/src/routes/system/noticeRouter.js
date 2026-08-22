// routes/system/noticeRouter.js
// base: /api/notices
// -----------------------------------------------
// 공지사항 라우터 — 실제 로직은 controllers/system/notice.controller.js에 있다 (지침 §1).
// -----------------------------------------------
const express = require('express')
const router = express.Router()

const requireMaster = require('@/middlewares/requireMaster') // 마스터 가드
const controller = require('@/controllers/system/notice.controller')

router.get('/', controller.list)               // 리스트 (공개)
router.get('/manage', requireMaster, controller.listAll) // 전체 목록 (마스터)
router.get('/manage/:id', requireMaster, controller.getManagedOne) // 비공개 포함 상세 (마스터)
router.get('/:id', controller.getPublishedOne) // 공개 상세(세션 역할을 신뢰하지 않음)
router.post('/', requireMaster, controller.create)   // 생성 (마스터)
router.put('/:id', requireMaster, controller.update) // 수정 (마스터)
router.delete('/:id', requireMaster, controller.remove) // 삭제 (마스터)

module.exports = router
