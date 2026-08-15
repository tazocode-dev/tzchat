// 기존 아이디·비밀번호 회원가입과 공개 사용자 목록을 담당하는 도메인 서비스.
// 신규 기본 가입·로그인은 전화번호 문자 인증 흐름을 사용한다.

const bcrypt = require('bcrypt');
const { User, Terms, UserAgreement } = require('@/models');

class SignupError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function s(value) {
  return (value || '').toString().trim();
}

function getDupFieldFromE11000(error) {
  const keyPattern = error?.keyPattern || {};
  const keyValue = error?.keyValue || {};
  return Object.keys(keyValue)[0] || Object.keys(keyPattern)[0] || '';
}

async function signupUser(body) {
  const username = s(body?.username);
  const password = s(body?.password);
  const nickname = s(body?.nickname);
  const gender = s(body?.gender);
  const region1 = s(body?.region1);
  const region2 = s(body?.region2);
  const birthyear = Number.parseInt(String(body?.birthyear || ''), 10);
  const consents = Array.isArray(body?.consents) ? body.consents : [];

  if (!username || !password || !nickname || !region1 || !region2 || !Number.isFinite(birthyear)) {
    throw new SignupError(400, 'MISSING_REQUIRED', '필수 항목 누락');
  }
  if (!['man', 'woman'].includes(gender)) {
    throw new SignupError(400, 'INVALID_GENDER', '성별이 올바르지 않습니다.');
  }
  if (new Date().getFullYear() - birthyear < 19) {
    throw new SignupError(400, 'MINOR_BLOCKED', '미성년자는 회원가입이 불가합니다.');
  }

  const [userExists, nicknameExists] = await Promise.all([
    User.findOne({ username }).select('_id').lean(),
    User.findOne({ nickname }).select('_id').lean(),
  ]);
  if (userExists) throw new SignupError(409, 'USERNAME_DUP', '아이디 중복');
  if (nicknameExists) throw new SignupError(409, 'NICKNAME_DUP', '닉네임 중복');

  let user;
  try {
    user = await User.create({
      username,
      password: await bcrypt.hash(password, 10),
      nickname,
      gender,
      birthyear,
      region1,
      region2,
      last_login: null,
      heart: 400,
      star: 0,
      ruby: 0,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const field = getDupFieldFromE11000(error);
      const label = field === 'nickname' ? '닉네임' : field === 'username' ? '아이디' : (field || '값');
      throw new SignupError(409, 'DUP_KEY', `${label} 중복`);
    }
    if (error?.name === 'ValidationError') {
      throw new SignupError(400, 'VALIDATION_ERROR', '회원정보 형식이 올바르지 않습니다.');
    }
    throw new SignupError(500, 'CREATE_USER_FAILED', '서버 오류');
  }

  if (consents.length > 0) {
    try {
      const activeConsents = await Terms.find({ isActive: true, kind: 'consent' })
        .select('slug title version defaultRequired')
        .lean();
      const activeBySlug = new Map(activeConsents.map((document) => [String(document.slug), document]));
      const now = new Date();
      const bulk = [];

      for (const consent of consents) {
        if (!consent || typeof consent.slug !== 'string') continue;
        const slug = String(consent.slug);
        const matched = activeBySlug.get(slug);
        bulk.push({
          updateOne: {
            filter: { userId: user._id, slug },
            update: {
              $set: {
                version: consent.version != null ? String(consent.version) : String(matched?.version || ''),
                agreedAt: now,
                optedIn: typeof consent.optedIn === 'boolean' ? consent.optedIn : true,
                docId: matched?._id,
                meta: matched ? {
                  title: matched.title,
                  kind: 'consent',
                  defaultRequired: !!matched.defaultRequired,
                } : undefined,
              },
            },
            upsert: true,
          },
        });
      }
      if (bulk.length > 0) await UserAgreement.bulkWrite(bulk);
    } catch (error) {
      console.warn('[AUTH][WARN] 약관 동의 저장을 건너뜁니다.', error?.message);
    }
  }

  return { userId: user._id, username, phoneStored: false };
}

async function listPublicUsers({ page: pageInput, limit: limitInput }) {
  const page = Math.max(1, Number.parseInt(pageInput, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitInput, 10) || 200));
  const users = await User.find({})
    .select('username nickname birthyear gender region1 region2 preference selfintro')
    .skip((page - 1) * limit)
    .limit(limit);

  return { users, page, limit };
}

module.exports = { signupUser, SignupError, listPublicUsers };
