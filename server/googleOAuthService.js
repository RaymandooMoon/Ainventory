import crypto from 'node:crypto';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PEOPLE_ME_URL =
  'https://people.googleapis.com/v1/people/me?personFields=genders,birthdays';
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let googleJwksCache = {
  fetchedAt: 0,
  expiresAt: 0,
  keys: [],
};

export function resetGoogleJwksCacheForTests() {
  googleJwksCache = { fetchedAt: 0, expiresAt: 0, keys: [] };
}

function timingSafeEquals(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Generates RFC 7636 PKCE verifier and S256 challenge.
 */
export function createPkceChallenge() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return {
    codeVerifier,
    codeChallenge,
    method: 'S256',
  };
}

/**
 * Strictly constrains post-OAuth return paths to same-origin `/app*` paths
 * to eliminate Open Redirect vulnerabilities.
 */
export function sanitizeAppReturnTo(rawReturnTo, fallback = '/app') {
  if (typeof rawReturnTo !== 'string') return fallback;
  const trimmed = rawReturnTo.trim();
  if (!trimmed || trimmed.length > 256) return fallback;
  if (/[\r\n\u0000-\u001f\\]/.test(trimmed)) return fallback;
  if (!trimmed.startsWith('/app')) return fallback;
  if (trimmed.startsWith('//') || trimmed.includes('://')) return fallback;
  if (trimmed !== '/app' && !trimmed.startsWith('/app/')) return fallback;
  return trimmed;
}

/**
 * Resolves the canonical public origin for constructing OAuth redirect_uri.
 */
export function resolvePublicOrigin(req) {
  const envOrigin = String(process.env.APP_PUBLIC_ORIGIN || '').trim();
  if (envOrigin) {
    try {
      const parsed = new URL(envOrigin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // fall through
    }
  }
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto === 'https' || req?.secure ? 'https' : 'http';
  const rawHost = String(
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost:3000'
  )
    .split(',')[0]
    .trim();
  const safeHost = /^[a-zA-Z0-9.:-]+$/.test(rawHost) ? rawHost : 'localhost:3000';
  return `${proto}://${safeHost}`;
}

export function resolveOAuthStateSecret() {
  const explicit = String(process.env.OAUTH_STATE_SECRET || '').trim();
  if (explicit.length >= 16) return explicit;
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (clientSecret.length >= 12) {
    return crypto.createHash('sha256').update(`ainvtry-oauth-state:${clientSecret}`).digest('hex');
  }
  const clientId = String(
    process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  ).trim();
  if (clientId) {
    return crypto.createHash('sha256').update(`ainvtry-oauth-dev:${clientId}`).digest('hex');
  }
  return '';
}

export function signOAuthStateCookie(payload, secret) {
  if (!secret) throw new Error('OAuth state signing secret is not configured');
  const body = {
    ...payload,
    exp: payload?.exp || Date.now() + OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`goa1.${encoded}`).digest('hex');
  return `goa1.${encoded}.${sig}`;
}

export function verifyOAuthStateCookie(rawValue, secret) {
  if (!rawValue || typeof rawValue !== 'string' || !secret) return null;
  const parts = rawValue.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'goa1') return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig || encoded.length > 4096 || sig.length !== 64) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(`goa1.${encoded}`).digest('hex');
  if (!timingSafeEquals(expectedSig, sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isFinite(parsed.exp) || Date.now() > Number(parsed.exp)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  nonce,
  codeChallenge,
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope:
      'openid email profile https://www.googleapis.com/auth/user.gender.read https://www.googleapis.com/auth/user.birthday.read',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function parseMaxAgeMs(cacheControlHeader) {
  const match = String(cacheControlHeader || '').match(/max-age=(\d+)/i);
  if (!match) return DEFAULT_JWKS_TTL_MS;
  const sec = Number(match[1]);
  if (!Number.isFinite(sec) || sec <= 0) return DEFAULT_JWKS_TTL_MS;
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, sec * 1000));
}

async function fetchGoogleJwksKeys(forceRefresh = false, fetchImpl = fetch) {
  const now = Date.now();
  if (!forceRefresh && googleJwksCache.keys.length > 0 && now < googleJwksCache.expiresAt) {
    return googleJwksCache.keys;
  }
  const res = await fetchImpl(GOOGLE_JWKS_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google OIDC JWKS (${res.status})`);
  }
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (keys.length === 0) {
    throw new Error('Google OIDC JWKS returned no signing keys');
  }
  const ttlMs = parseMaxAgeMs(res.headers?.get?.('cache-control'));
  googleJwksCache = {
    fetchedAt: now,
    expiresAt: now + ttlMs,
    keys,
  };
  return keys;
}

/**
 * Cryptographically verifies a Google OIDC ID Token locally via Google JWKS (RS256).
 * Validates alg, kid, RSA-SHA256 signature, iss, aud, azp, exp, nbf, email_verified,
 * sub, and optional nonce without per-login tokeninfo round-trips.
 */
export async function verifyGoogleIdTokenJwks(credential, expectedClientId, options = {}) {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Missing Google identity token');
  }
  if (credential.length > 4096) {
    throw new Error('Google credential exceeds maximum allowed length');
  }
  const parts = credential.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Google identity token');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed Google identity token JSON');
  }

  if (!header || header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Google token algorithm or missing key id');
  }
  if (!claims || typeof claims !== 'object') {
    throw new Error('Invalid Google token payload');
  }

  // Issuer check
  if (!ALLOWED_ISSUERS.has(String(claims.iss || ''))) {
    throw new Error('Invalid Google token issuer');
  }

  // Audience & authorized party check
  const aud = String(claims.aud || '').trim();
  if (!expectedClientId || aud !== expectedClientId) {
    throw new Error('Google token audience mismatch');
  }
  if (claims.azp && String(claims.azp).trim() !== expectedClientId) {
    throw new Error('Google token authorized party mismatch');
  }

  // Temporal checks
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp || 0);
  if (!exp || exp <= nowSec) {
    throw new Error('Google identity token has expired');
  }
  if (claims.nbf !== undefined && Number(claims.nbf) > nowSec + 60) {
    throw new Error('Google identity token is not yet valid');
  }

  // Nonce check (mandatory in PKCE callback flow)
  if (options.expectedNonce) {
    if (!timingSafeEquals(claims.nonce, options.expectedNonce)) {
      throw new Error('Google identity token nonce mismatch');
    }
  }

  // Email verification & subject check
  const isEmailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!isEmailVerified) {
    throw new Error('Google email is not verified');
  }
  if (!claims.sub || typeof claims.sub !== 'string' || claims.sub.length > 128) {
    throw new Error('Google token missing valid subject');
  }

  // Resolve matching JWK (re-fetch once on unknown kid for seamless key rotation)
  const fetchImpl = options.fetchImpl || fetch;
  let keys = Array.isArray(options.jwksKeysOverride)
    ? options.jwksKeysOverride
    : await fetchGoogleJwksKeys(false, fetchImpl);
  let jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk && !Array.isArray(options.jwksKeysOverride)) {
    keys = await fetchGoogleJwksKeys(true, fetchImpl);
    jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  }
  if (!jwk) {
    throw new Error('Matching Google OIDC JWK not found');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
    publicKey,
    Buffer.from(sigB64, 'base64url')
  );
  if (!verified) {
    throw new Error('Invalid Google identity token signature');
  }

  return claims;
}

/**
 * Exchanges an OAuth 2.0 authorization code + PKCE verifier for a Google OIDC id_token.
 * Access & refresh tokens are intentionally discarded immediately (zero storage policy).
 */
export async function exchangeGoogleAuthCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier,
  fetchImpl = fetch,
}) {
  const form = new URLSearchParams({
    code: String(code || ''),
    client_id: String(clientId || ''),
    client_secret: String(clientSecret || ''),
    redirect_uri: String(redirectUri || ''),
    grant_type: 'authorization_code',
    code_verifier: String(codeVerifier || ''),
  });

  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const body = await res.json();
  const idToken = String(body?.id_token || '').trim();
  const accessToken = String(body?.access_token || '').trim();
  if (!idToken) {
    throw new Error('Google token exchange returned no id_token');
  }
  return { idToken, accessToken };
}

function normalizeGoogleGenderValue(rawValue) {
  const val = String(rawValue || '').trim().toLowerCase();
  if (val === 'male' || val === 'female') return val;
  return null;
}

function inferAgeFromPeopleBirthdays(birthdays) {
  if (!Array.isArray(birthdays) || birthdays.length === 0) {
    return { age: null, ageGroup: null };
  }
  const sorted = [...birthdays].sort((a, b) => {
    const aPrim = a?.metadata?.primary ? 1 : 0;
    const bPrim = b?.metadata?.primary ? 1 : 0;
    return bPrim - aPrim;
  });
  const now = new Date();
  const currYear = now.getUTCFullYear();
  const currMonth = now.getUTCMonth() + 1;
  const currDay = now.getUTCDate();

  for (const entry of sorted) {
    const year = Number(entry?.date?.year || 0);
    if (!Number.isInteger(year) || year < 1920 || year > currYear - 8) continue;
    const month = Number(entry?.date?.month || 1);
    const day = Number(entry?.date?.day || 1);
    let age = currYear - year;
    if (month > currMonth || (month === currMonth && day > currDay)) {
      age -= 1;
    }
    if (age < 8 || age > 105) continue;
    let ageGroup = '30s';
    if (age < 20) ageGroup = '10s';
    else if (age < 30) ageGroup = '20s';
    else if (age < 40) ageGroup = '30s';
    else if (age < 50) ageGroup = '40s';
    else if (age < 60) ageGroup = '50s';
    else ageGroup = '60s';
    return { age, ageGroup };
  }
  return { age: null, ageGroup: null };
}

/**
 * Best-effort lookup of Google account gender & birth-year age group via People API.
 * Uses the transient OAuth access_token in memory only (zero storage) and never blocks login.
 */
export async function fetchGooglePeopleProfile(accessToken, fetchImpl = fetch) {
  const token = String(accessToken || '').trim();
  if (!token) {
    return { gender: null, age: null, ageGroup: null };
  }
  try {
    const res = await fetchImpl(GOOGLE_PEOPLE_ME_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { gender: null, age: null, ageGroup: null };
    }
    const payload = await res.json();
    const genders = Array.isArray(payload?.genders) ? payload.genders : [];
    const sortedGenders = [...genders].sort((a, b) => {
      const aPrim = a?.metadata?.primary ? 1 : 0;
      const bPrim = b?.metadata?.primary ? 1 : 0;
      return bPrim - aPrim;
    });
    let gender = null;
    for (const g of sortedGenders) {
      const normalized = normalizeGoogleGenderValue(g?.value);
      if (normalized) {
        gender = normalized;
        break;
      }
    }
    const { age, ageGroup } = inferAgeFromPeopleBirthdays(payload?.birthdays);
    return { gender, age, ageGroup };
  } catch {
    return { gender: null, age: null, ageGroup: null };
  }
}

/**
 * Resolves, links, or creates a user from verified Google OIDC claims using the
 * normalized `user_identities` table while strictly preventing email-based ATO.
 */
export async function resolveOrCreateGoogleUser(
  db,
  claims,
  {
    hashPassword,
    computeVerificationHash,
    assignUserRole,
    linkUserId = null,
    peopleProfile = null,
  }
) {
  const resolvedSub = String(claims?.sub || '').trim();
  const resolvedEmail = String(claims?.email || '').trim().toLowerCase();
  const displayName = String(claims?.name || '').trim().slice(0, 60) || 'Google 사용자';
  const prefillGender = normalizeGoogleGenderValue(peopleProfile?.gender);
  const prefillAge =
    Number.isInteger(Number(peopleProfile?.age)) && Number(peopleProfile?.age) >= 8
      ? Number(peopleProfile.age)
      : null;
  const prefillAgeGroup =
    typeof peopleProfile?.ageGroup === 'string' && peopleProfile.ageGroup.trim()
      ? peopleProfile.ageGroup.trim()
      : null;

  if (!resolvedSub || resolvedSub.length > 128) {
    return { ok: false, status: 400, code: 'INVALID_SUB', error: '유효하지 않은 Google 계정 식별자입니다.' };
  }

  // 1. Check normalized user_identities first, then legacy users.apple_sub fallback
  let identityRow = await db
    .prepare("SELECT * FROM user_identities WHERE provider = 'google' AND provider_sub = ?")
    .get(resolvedSub);

  let user = identityRow
    ? await db.prepare('SELECT * FROM users WHERE id = ?').get(identityRow.user_id)
    : await db
        .prepare("SELECT * FROM users WHERE apple_sub = ? AND auth_provider = 'google'")
        .get(resolvedSub);

  // Backfill normalized row if found via legacy column
  if (user && !identityRow) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_identities (user_id, provider, provider_sub, provider_email, email_verified)
         VALUES (?, 'google', ?, ?, 1)`
      )
      .run(user.id, resolvedSub, resolvedEmail || user.email || null);
  }

  // Explicit account-linking mode (from authenticated AccountSettingsSheet)
  if (linkUserId) {
    const targetUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(linkUserId));
    if (!targetUser) {
      return { ok: false, status: 404, code: 'USER_NOT_FOUND', error: '연결할 계정을 찾을 수 없습니다.' };
    }
    if (targetUser.role === 'admin') {
      return {
        ok: false,
        status: 403,
        code: 'ADMIN_SOCIAL_FORBIDDEN',
        error: '관리자 계정은 소셜 로그인 연동이 허용되지 않습니다.',
      };
    }
    if (user && Number(user.id) !== Number(targetUser.id)) {
      return {
        ok: false,
        status: 409,
        code: 'IDENTITY_ALREADY_LINKED',
        error: '이 Google 계정은 이미 다른 iNVTRY 계정에 연결되어 있습니다.',
      };
    }
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_identities (user_id, provider, provider_sub, provider_email, email_verified)
         VALUES (?, 'google', ?, ?, 1)`
      )
      .run(targetUser.id, resolvedSub, resolvedEmail || null);
    return { ok: true, user: targetUser, isNewUser: false, linked: true };
  }

  // Standard sign-in / sign-up mode
  if (user && user.role === 'admin') {
    return {
      ok: false,
      status: 403,
      code: 'ADMIN_SOCIAL_FORBIDDEN',
      error: '관리자 계정은 소셜 로그인 연동이 허용되지 않습니다.',
    };
  }

  if (user) {
    // Gently backfill missing gender/ageGroup from Google People API without overwriting locked/user-confirmed values
    const needsGenderBackfill = !user.gender && !user.gender_locked && Boolean(prefillGender);
    const needsAgeBackfill =
      (!user.age_group || user.age_group === 'unspecified') && Boolean(prefillAgeGroup);
    if (needsGenderBackfill || needsAgeBackfill) {
      await db
        .prepare(
          `UPDATE users
           SET gender = COALESCE(gender, ?),
               age_group = CASE WHEN age_group IS NULL OR age_group = 'unspecified' THEN COALESCE(?, age_group) ELSE age_group END,
               age = COALESCE(age, ?)
           WHERE id = ?`
        )
        .run(
          needsGenderBackfill ? prefillGender : null,
          needsAgeBackfill ? prefillAgeGroup : null,
          needsAgeBackfill ? prefillAge : null,
          user.id
        );
      user = (await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) || user;
    }
    return { ok: true, user, isNewUser: false, linked: false };
  }

  // Strictly block auto-merging into an existing email account (ATO prevention)
  if (resolvedEmail) {
    const emailOwner = await db
      .prepare('SELECT id, role, auth_provider FROM users WHERE lower(email) = ?')
      .get(resolvedEmail);
    if (emailOwner) {
      return {
        ok: false,
        status: 409,
        code: 'ACCOUNT_EMAIL_CONFLICT',
        error:
          '이미 다른 방식으로 가입된 이메일 계정입니다. 기존 로그인 방식으로 로그인한 뒤 계정 설정에서 Google 계정을 연결해 주세요.',
      };
    }
  }

  const shortHash = crypto.createHash('sha256').update(resolvedSub).digest('hex').slice(0, 10);
  let username = `google_${shortHash}`;
  while (await db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    username = `google_${shortHash}_${crypto.randomInt(100, 999)}`;
  }
  const closetKey = `closet_${username}`;
  const nowIso = new Date().toISOString();
  const vHash = computeVerificationHash(username, resolvedEmail, nowIso);

  const createdUser = await db.transaction(async () => {
    // New Google signups start with onboarding_status='not_started', gender_locked=0
    // (prefilling gender & ageGroup from Google People API when available so Step 1 is 1-tap confirm).
    const inserted = await db
      .prepare(`
        INSERT INTO users (
          username, email, password_hash, display_name, role, default_closet,
          closet_name, verified_at, verification_hash,
          gender, age_group, age, profile_completed, gender_locked,
          onboarding_status, onboarding_step, onboarding_steps_json,
          apple_sub, auth_provider
        ) VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, ?, ?, ?, 0, 0, 'not_started', 'identity_body', '{}', ?, 'google')
      `)
      .run(
        username,
        resolvedEmail || null,
        hashPassword(crypto.randomBytes(24).toString('hex')),
        displayName,
        closetKey,
        '내 옷장',
        nowIso,
        vHash,
        prefillGender,
        prefillAgeGroup,
        prefillAge,
        resolvedSub
      );

    const newUserId = Number(inserted?.lastInsertRowid || 0);
    if (newUserId > 0) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO user_identities (user_id, provider, provider_sub, provider_email, email_verified)
           VALUES (?, 'google', ?, ?, 1)`
        )
        .run(newUserId, resolvedSub, resolvedEmail || null);
      if (typeof assignUserRole === 'function') {
        await assignUserRole(db, newUserId, 'member');
      }
    }

    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  });

  return { ok: true, user: createdUser, isNewUser: true, linked: false };
}
