import express from 'express';
import db from './db.js';
import {
  DEFAULT_ISO_VIEW_ANGLE,
  VTON_MODE,
  getVtonServiceStatus,
  normalizeIsoViewAngleDeg,
  synthesizeVtonLook,
} from './vtonService.js';

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SYNTHESES_PER_WINDOW = 360;
const MAX_STATUS_PER_WINDOW = 480;
const MAX_RATE_BUCKETS = 2048;

const ACCEPTED_MODES = new Set([
  '',
  '2d-vton',
  '2d_vton',
  '2d',
  '2.5d',
  '3d',
  'hig-2.5d',
  'vton',
  'editorial',
  'illustration',
  'isometric',
  'iso-2d',
  'iso_2d',
]);

/** @type {Map<string, { windowStart: number, count: number, lastAt: number }>} */
const vtonRateBuckets = new Map();

function sweepRateBuckets() {
  const now = Date.now();
  if (vtonRateBuckets.size > 256) {
    for (const [key, entry] of vtonRateBuckets.entries()) {
      if (now - entry.windowStart > RATE_WINDOW_MS) {
        vtonRateBuckets.delete(key);
      }
    }
  }
  while (vtonRateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldestKey = vtonRateBuckets.keys().next().value;
    if (oldestKey === undefined) break;
    vtonRateBuckets.delete(oldestKey);
  }
}

function checkIpRateLimit(bucketKey, maxCount) {
  sweepRateBuckets();
  const now = Date.now();
  const entry = vtonRateBuckets.get(bucketKey);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    vtonRateBuckets.set(bucketKey, { windowStart: now, count: 1, lastAt: now });
    return { allowed: true, remaining: maxCount - 1, retryAfterSec: 0 };
  }

  if (entry.count >= maxCount) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((entry.windowStart + RATE_WINDOW_MS - now) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  entry.count += 1;
  entry.lastAt = now;
  return { allowed: true, remaining: maxCount - entry.count, retryAfterSec: 0 };
}

function resolveClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'local')
    .trim()
    .slice(0, 96);
}

function extractAuthToken(req) {
  const authHeader = String(req.headers?.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieHeader = String(req.headers?.cookie || '');
  const match = cookieHeader.match(/(?:^|;\s*)ainventory_token=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

function resolveAuthorizedClosetsForUser(userRow) {
  const defaultCloset = String(userRow?.default_closet || '').trim();
  const role = String(userRow?.role || 'member').trim();

  if (role === 'admin') {
    return [...new Set(['husband', 'wife', 'sample', defaultCloset].filter(Boolean))];
  }
  if (defaultCloset === 'husband' || defaultCloset === 'wife') {
    return ['husband', 'wife', 'sample'];
  }
  return [...new Set([defaultCloset, 'sample'].filter(Boolean))];
}

/**
 * Read-only session resolution middleware for `/api/vton/*`.
 * Allows authenticated users OR unauthenticated Sample Demo guests (`X-Demo-Mode: sample`).
 */
function requireVtonSessionOrSample(req, res, next) {
  const token = extractAuthToken(req);
  if (token) {
    try {
      const session = db
        .prepare(
          `SELECT
             s.token,
             s.expires_at,
             u.id,
             u.username,
             u.role,
             u.default_closet,
             u.height_cm,
             u.weight_kg,
             u.personal_color,
             u.skin_tone_hex,
             u.body_shape
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token = ?`
        )
        .get(token);

      if (session && session.expires_at && new Date(session.expires_at) >= new Date()) {
        req.vtonAuth = {
          isAuthenticated: true,
          isSampleGuest: false,
          userRow: session,
          authorizedClosets: resolveAuthorizedClosetsForUser(session),
        };
        return next();
      }
    } catch {
      // Fall through to sample-header check if session lookup fails
    }
  }

  const demoHeader = String(req.headers?.['x-demo-mode'] || '')
    .trim()
    .toLowerCase();
  const allowedRoute =
    (req.method === 'GET' && req.path === '/status') ||
    (req.method === 'POST' && req.path === '/synthesize');

  if (demoHeader === 'sample' && allowedRoute) {
    req.vtonAuth = {
      isAuthenticated: false,
      isSampleGuest: true,
      userRow: null,
      authorizedClosets: ['sample'],
    };
    return next();
  }

  return res.status(401).json({ error: '로그인이 필요합니다.' });
}

function validateRequestedClosetScope(vtonAuth, rawRequestedCloset) {
  if (rawRequestedCloset === undefined || rawRequestedCloset === null) {
    return { ok: true };
  }
  const requested = String(rawRequestedCloset).trim();
  if (!requested) return { ok: true };

  if (vtonAuth.isSampleGuest) {
    if (requested !== 'sample') {
      return {
        ok: false,
        status: 403,
        error: '샘플 체험 모드에서는 샘플 옷장(sample)만 조회할 수 있습니다.',
      };
    }
    return { ok: true };
  }

  if (requested === 'all') {
    const defaultCloset = String(vtonAuth.userRow?.default_closet || '').trim();
    const isAdminOrCouple =
      vtonAuth.userRow?.role === 'admin' ||
      defaultCloset === 'husband' ||
      defaultCloset === 'wife';
    if (!isAdminOrCouple) {
      return {
        ok: false,
        status: 403,
        error: '허용되지 않은 옷장 접근 요청입니다.',
      };
    }
    return { ok: true };
  }

  if (!vtonAuth.authorizedClosets.includes(requested)) {
    return {
      ok: false,
      status: 403,
      error: '허용되지 않은 옷장 접근 요청입니다.',
    };
  }

  return { ok: true };
}

function normalizeSynthesisMode(rawMode) {
  if (rawMode === undefined || rawMode === null) {
    return { ok: true, mode: VTON_MODE };
  }
  if (typeof rawMode !== 'string') {
    return { ok: false, error: '유효하지 않은 VTON 모드 형식입니다.' };
  }
  const cleaned = rawMode.trim().toLowerCase();
  if (!ACCEPTED_MODES.has(cleaned)) {
    return { ok: false, error: '지원하지 않는 VTON 모드입니다.' };
  }
  return { ok: true, mode: VTON_MODE };
}

export function createVtonRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '8mb' }));

  router.get('/status', requireVtonSessionOrSample, (req, res) => {
    const ipRate = checkIpRateLimit(`vton:status:${resolveClientIp(req)}`, MAX_STATUS_PER_WINDOW);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      return res.status(429).json({
        error: `요청이 너무 많습니다. ${ipRate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      });
    }

    const scopeCheck = validateRequestedClosetScope(req.vtonAuth, req.query?.closet);
    if (!scopeCheck.ok) {
      return res.status(scopeCheck.status).json({ error: scopeCheck.error });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(getVtonServiceStatus());
  });

  router.post('/synthesize', requireVtonSessionOrSample, async (req, res) => {
    const ipRate = checkIpRateLimit(
      `vton:synth:${resolveClientIp(req)}`,
      MAX_SYNTHESES_PER_WINDOW
    );
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      return res.status(429).json({
        error: `가상 피팅 합성 요청이 너무 많습니다. ${ipRate.retryAfterSec}초 후 다시 시도해주세요.`,
        code: 'RATE_LIMITED',
        retryAfterSec: ipRate.retryAfterSec,
      });
    }

    const body = req.body;
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
      return res.status(400).json({ error: '유효한 JSON 요청 본문이 필요합니다.' });
    }
    const payload = body || {};

    const requestedCloset =
      payload.closet ?? payload.closetOwner ?? payload.closet_owner ?? req.query?.closet;
    const scopeCheck = validateRequestedClosetScope(req.vtonAuth, requestedCloset);
    if (!scopeCheck.ok) {
      return res.status(scopeCheck.status).json({ error: scopeCheck.error });
    }

    const modeResult = normalizeSynthesisMode(payload.mode);
    if (!modeResult.ok) {
      return res.status(400).json({ error: modeResult.error });
    }

    // Merge authenticated user's non-gender DB anthropometrics underneath explicit client profile
    const userDefaults = req.vtonAuth.userRow
      ? {
          skinToneHex: req.vtonAuth.userRow.skin_tone_hex ?? undefined,
          personalColor: req.vtonAuth.userRow.personal_color ?? undefined,
          heightCm: req.vtonAuth.userRow.height_cm ?? undefined,
          weightKg: req.vtonAuth.userRow.weight_kg ?? undefined,
          bodyShape: req.vtonAuth.userRow.body_shape ?? undefined,
        }
      : {};

    const rawClientProfile =
      payload.profile && typeof payload.profile === 'object' && !Array.isArray(payload.profile)
        ? payload.profile
        : payload.bodyProfile &&
            typeof payload.bodyProfile === 'object' &&
            !Array.isArray(payload.bodyProfile)
          ? payload.bodyProfile
          : {};

    const rawViewAngle =
      payload.viewAngleDeg ?? payload.view_angle_deg ?? rawClientProfile.viewAngleDeg;
    if (
      rawViewAngle !== undefined &&
      rawViewAngle !== null &&
      rawViewAngle !== '' &&
      (typeof rawViewAngle === 'object' ||
        typeof rawViewAngle === 'boolean' ||
        !Number.isFinite(Number(rawViewAngle)))
    ) {
      return res
        .status(400)
        .json({ error: '유효하지 않은 시점 각도(viewAngleDeg) 형식입니다.' });
    }
    const viewAngleDeg = normalizeIsoViewAngleDeg(rawViewAngle, DEFAULT_ISO_VIEW_ANGLE);

    const rawAvatarSpec =
      payload.avatarSpec &&
      typeof payload.avatarSpec === 'object' &&
      !Array.isArray(payload.avatarSpec)
        ? payload.avatarSpec
        : rawClientProfile.avatarSpec &&
            typeof rawClientProfile.avatarSpec === 'object' &&
            !Array.isArray(rawClientProfile.avatarSpec)
          ? rawClientProfile.avatarSpec
          : null;

    const rawHashCandidate =
      payload.avatarConfigHash ??
      payload.avatar_config_hash ??
      rawClientProfile.avatarConfigHash;
    const avatarConfigHash =
      typeof rawHashCandidate === 'string' && rawHashCandidate.trim()
        ? rawHashCandidate.trim().slice(0, 64)
        : null;

    const mergedProfile = {
      ...userDefaults,
      ...(payload.skinToneHex !== undefined ? { skinToneHex: payload.skinToneHex } : {}),
      ...(payload.personalColor !== undefined ? { personalColor: payload.personalColor } : {}),
      ...(payload.heightCm !== undefined ? { heightCm: payload.heightCm } : {}),
      ...(payload.weightKg !== undefined ? { weightKg: payload.weightKg } : {}),
      ...(payload.bodyShape !== undefined ? { bodyShape: payload.bodyShape } : {}),
      ...(payload.shoulderScale !== undefined ? { shoulderScale: payload.shoulderScale } : {}),
      ...(payload.waistScale !== undefined ? { waistScale: payload.waistScale } : {}),
      ...(payload.hipScale !== undefined ? { hipScale: payload.hipScale } : {}),
      ...rawClientProfile,
      viewAngleDeg,
      ...(avatarConfigHash ? { avatarConfigHash } : {}),
      ...(rawAvatarSpec ? { avatarSpec: rawAvatarSpec } : {}),
    };

    const result = await synthesizeVtonLook({
      mode: modeResult.mode,
      profile: mergedProfile,
      avatarSpec: rawAvatarSpec,
      avatarConfigHash,
      viewAngleDeg,
      portraitDataUrl:
        rawClientProfile.portraitDataUrl ??
        payload.portraitDataUrl ??
        rawClientProfile.faceDataUrl ??
        payload.faceDataUrl ??
        null,
      slots: payload.slots,
      equipped: payload.equipped,
      equippedSlots: payload.equippedSlots,
      outfit: payload.outfit,
      garments: payload.garments,
      items: payload.items,
      itemIds: payload.itemIds ?? payload.item_ids,
      includeBaseModel: Boolean(
        payload.includeBaseModel ?? payload.synthesizeBaseModel ?? false
      ),
      forceRefresh: Boolean(payload.forceRefresh ?? payload.bypassCache ?? false),
      authorizedClosets: req.vtonAuth.authorizedClosets,
      isSampleGuest: req.vtonAuth.isSampleGuest,
      isAuthenticated: req.vtonAuth.isAuthenticated,
    });

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(result);
  });

  router.use((_req, res) => {
    res.status(404).json({ error: 'VTON API endpoint not found' });
  });

  router.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({
        error: '요청 데이터 크기가 허용 한도(8MB)를 초과했습니다.',
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: '유효하지 않은 JSON 형식입니다.',
      });
    }
    return res.status(500).json({
      error: 'VTON 요청 처리 중 오류가 발생했습니다.',
    });
  });

  return router;
}
