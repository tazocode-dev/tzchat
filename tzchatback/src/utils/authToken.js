function extractHttpToken(req) {
  const auth = String(req?.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();

  const legacyHeader = req?.headers?.['x-auth-token'];
  if (legacyHeader) return String(legacyHeader).trim();

  return null;
}

module.exports = { extractHttpToken };
