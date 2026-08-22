const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');
const { getAccountRestriction } = require('@/services/auth/accountStatusService');

const AUTHENTICATION_ERROR_MESSAGE = 'Authentication failed';

function authenticationError() {
  return new Error(AUTHENTICATION_ERROR_MESSAGE);
}

function explicitSocketToken(handshake = {}) {
  const authPayload = handshake.auth || {};
  if (Object.prototype.hasOwnProperty.call(authPayload, 'token')) {
    return { provided: true, token: String(authPayload.token || '').trim() };
  }

  const authorization = String(handshake.headers?.authorization || '');
  if (authorization.startsWith('Bearer ')) {
    return { provided: true, token: authorization.slice(7).trim() };
  }

  return { provided: false, token: '' };
}

function tokenUserId(payload) {
  return String(payload?.sub || payload?._id || payload?.userId || '').trim();
}

function createSocketAuthMiddleware({ UserModel, verifyTokenFn = jwt.verify, jwtSecret = JWT_SECRET } = {}) {
  const getUserModel = () => UserModel || require('@/models').User;

  return async function socketAuth(socket, next) {
    try {
      const tokenResult = explicitSocketToken(socket.handshake || {});
      let userId = '';
      let via = '';

      // 명시적으로 전달된 토큰은 세션보다 우선하며, 잘못된 토큰을 세션으로 우회하지 않는다.
      if (tokenResult.provided) {
        if (!tokenResult.token) return next(authenticationError());
        let payload;
        try {
          payload = verifyTokenFn(tokenResult.token, jwtSecret);
        } catch {
          return next(authenticationError());
        }
        userId = tokenUserId(payload);
        via = 'jwt';
      } else {
        userId = String(socket.request?.session?.user?._id || '').trim();
        via = 'session';
      }

      if (!userId) return next(authenticationError());

      const query = getUserModel().findById(userId)
        .select('_id suspended status deletionDueAt isDeleted');
      const user = typeof query.lean === 'function' ? await query.lean() : await query;
      if (!user || getAccountRestriction(user)) return next(authenticationError());

      const verifiedUserId = String(user._id);
      socket.user = { _id: verifiedUserId };
      socket.authVia = via;
      return next();
    } catch {
      return next(authenticationError());
    }
  };
}

module.exports = {
  AUTHENTICATION_ERROR_MESSAGE,
  createSocketAuthMiddleware,
  explicitSocketToken,
  tokenUserId,
};
