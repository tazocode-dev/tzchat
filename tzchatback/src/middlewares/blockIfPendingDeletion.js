// server/middlewares/blockIfPendingDeletion.js
module.exports = function blockIfPendingDeletion(req, res, next) {
  // 로그인 미들웨어(세션/JWT) 이후에 실행된다고 가정
  const u = req.user || req.session?.user || req.auth?.user;
  if (!u) return res.status(401).json({ error: 'Unauthorized' });

  // 공통 정책: status === 'pendingDeletion' 이거나 deletionDueAt가 존재하면 차단
  const isPending =
    u.status === 'pendingDeletion' ||
    Boolean(u.deletionDueAt);

  if (isPending) {
    return res.status(423).json({
      error: 'Account is pending deletion',
      code: 'PENDING_DELETION',
      status: u.status || null,
      deletionDueAt: u.deletionDueAt || null, // 워커와 동일 필드명
    });
  }

  next();
};
