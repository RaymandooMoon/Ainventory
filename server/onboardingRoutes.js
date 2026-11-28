import {
  STARTER_CAPSULE_NOTE_TAG,
  normalizeOnboardingAgeGroup,
  normalizeOnboardingStepKey,
  parseOnboardingStepsJson,
  selectStarterCapsule6,
} from '../src/shared/onboardingStarterCapsule.js';
import { normalizeHandednessConfig } from './db.js';
import { normalizeBodyShapeKey } from './wardrobeStatsAndGenerator.js';

function parseBoundedNumber(raw, min, max) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(Math.max(min, Math.min(max, n)).toFixed(1));
}

function normalizeBinaryGender(raw) {
  const token = String(raw || '').trim().toLowerCase();
  if (token === 'male' || token === 'female') return token;
  return null;
}

function isGenderLockEnforcedUser(userRow) {
  if (!userRow) return false;
  const role = String(userRow.role || '').trim();
  const username = String(userRow.username || '').trim().toLowerCase();
  if (role === 'site_demo' || role === 'admin') return false;
  if (username === 'husband' || username === 'wife' || username === 'admin' || username === 'site_demo') {
    return false;
  }
  return true;
}

export function mountOnboardingRoutes(
  router,
  {
    db,
    saveServerProfileConfig,
    formatUserPayload,
    requireStrictUserAuth,
    requirePermission,
    resolveAuthorizedClosets,
    resolveManifestSlotAndGlb,
    parseGarmentRow,
  }
) {
  // 1. Progressive Onboarding Step Update (atomic body/skin/step persistence + permanent gender lock)
  router.patch(
    '/auth/onboarding',
    requireStrictUserAuth,
    requirePermission('profile:write'),
    async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const incomingGender = normalizeBinaryGender(body.gender);
      const lockGender = Boolean(body.lockGender ?? body.lock_gender);
      const incomingAgeGroup = normalizeOnboardingAgeGroup(
        body.ageGroup ?? body.age_group,
        body.age
      );
      const incomingAge = parseBoundedNumber(body.age, 8, 105);
      const incomingHeight = parseBoundedNumber(body.heightCm ?? body.height_cm, 100, 230);
      const incomingWeight = parseBoundedNumber(body.weightKg ?? body.weight_kg, 30, 180);
      const rawBodyShape = body.bodyShape ?? body.body_shape;
      const incomingBodyShape =
        rawBodyShape !== undefined ? normalizeBodyShapeKey(rawBodyShape) : undefined;
      const incomingPersonalColor = String(body.personalColor ?? body.personal_color ?? '')
        .trim()
        .slice(0, 40);
      const incomingSkinHex = String(body.skinToneHex ?? body.skin_tone_hex ?? '')
        .trim()
        .slice(0, 16);
      const rawHandedness = body.handedness ?? body.dominantHand ?? body.dominant_hand;

      const requestedStatus = String(body.status || '').trim();
      const nextStatusCandidate =
        requestedStatus === 'deferred' || requestedStatus === 'in_progress'
          ? requestedStatus
          : null;
      const requestedStep = body.currentStep ?? body.step;
      const nextStepCandidate = requestedStep ? normalizeOnboardingStepKey(requestedStep) : null;
      const stepsPatch =
        body.stepsPatch && typeof body.stepsPatch === 'object' && !Array.isArray(body.stepsPatch)
          ? body.stepsPatch
          : {};

      const txResult = await db.transaction(async () => {
        const prevRow = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!prevRow) {
          return { errorStatus: 404, error: '계정 정보를 찾을 수 없습니다.', code: 'USER_NOT_FOUND' };
        }

        const enforceLock = isGenderLockEnforcedUser(prevRow);
        const alreadyLocked = Boolean(prevRow.gender_locked) && enforceLock;
        if (
          alreadyLocked &&
          incomingGender &&
          prevRow.gender &&
          incomingGender !== String(prevRow.gender).toLowerCase()
        ) {
          return {
            errorStatus: 403,
            error: '성별은 최초 확정 이후 변경할 수 없습니다.',
            code: 'GENDER_LOCKED',
          };
        }

        const nextGender = alreadyLocked
          ? prevRow.gender
          : incomingGender || prevRow.gender || null;
        const nextGenderLocked =
          enforceLock && (Boolean(prevRow.gender_locked) || (lockGender && Boolean(nextGender)))
            ? 1
            : Number(prevRow.gender_locked || 0);

        const nextAgeGroup = incomingAgeGroup || prevRow.age_group || null;
        const nextAge = incomingAge !== null ? Math.round(incomingAge) : (prevRow.age ?? null);
        const nextHeight = incomingHeight !== null ? incomingHeight : (prevRow.height_cm ?? null);
        const nextWeight = incomingWeight !== null ? incomingWeight : (prevRow.weight_kg ?? null);
        const nextBodyShape =
          incomingBodyShape !== undefined ? incomingBodyShape : (prevRow.body_shape ?? null);
        const nextPersonalColor = incomingPersonalColor || prevRow.personal_color || null;
        const nextSkinHex = incomingSkinHex || prevRow.skin_tone_hex || null;
        const nextHandedness =
          rawHandedness !== undefined && rawHandedness !== null && rawHandedness !== ''
            ? normalizeHandednessConfig(rawHandedness, 'right')
            : normalizeHandednessConfig(prevRow.handedness, 'right');

        const mergedSteps = {
          ...parseOnboardingStepsJson(prevRow.onboarding_steps_json),
          ...stepsPatch,
        };
        const currentDbStatus = String(prevRow.onboarding_status || 'not_started');
        const nextStatus =
          currentDbStatus === 'completed'
            ? 'completed'
            : nextStatusCandidate || (currentDbStatus === 'not_started' ? 'in_progress' : currentDbStatus);
        const nextStep = nextStepCandidate || normalizeOnboardingStepKey(prevRow.onboarding_step);

        // Canonical lock order: UPDATE users FIRST, then upsert profile_configs
        await db
          .prepare(`
            UPDATE users
            SET gender = ?,
                gender_locked = ?,
                age_group = ?,
                age = ?,
                height_cm = ?,
                weight_kg = ?,
                body_shape = ?,
                personal_color = ?,
                skin_tone_hex = ?,
                handedness = ?,
                onboarding_status = ?,
                onboarding_step = ?,
                onboarding_steps_json = ?
            WHERE id = ?
          `)
          .run(
            nextGender,
            nextGenderLocked,
            nextAgeGroup,
            nextAge,
            nextHeight,
            nextWeight,
            nextBodyShape,
            nextPersonalColor,
            nextSkinHex,
            nextHandedness,
            nextStatus,
            nextStep,
            JSON.stringify(mergedSteps),
            req.user.id
          );

        if (rawHandedness !== undefined && rawHandedness !== null && rawHandedness !== '') {
          await saveServerProfileConfig({
            userId: req.user.id,
            profileKey: req.headers['x-profile-key'] || body.profileKey || null,
            handedness: nextHandedness,
            skipUsersUpdate: true,
          });
        }

        const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        return { updated };
      });

      if (txResult.errorStatus) {
        return res.status(txResult.errorStatus).json({
          ok: false,
          error: txResult.error,
          code: txResult.code,
        });
      }

      return res.json({
        ok: true,
        user: await formatUserPayload(txResult.updated),
      });
    }
  );

  // 2. Preview Personalized 6-Piece Starter Capsule
  router.get('/auth/onboarding/starter-capsule', requireStrictUserAuth, async (req, res) => {
    const userRow = (await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) || {};
    const personalColor = String(
      req.query?.personalColor || userRow.personal_color || 'autumn_warm'
    ).trim();
    const gender = normalizeBinaryGender(req.query?.gender || userRow.gender) || 'male';
    const ageGroup =
      normalizeOnboardingAgeGroup(req.query?.ageGroup || userRow.age_group, userRow.age) || '30s';

    const items = selectStarterCapsule6({ personalColor, gender, ageGroup });
    return res.json({
      ok: true,
      personalColor,
      gender,
      ageGroup,
      items,
    });
  });

  // 3. Import Personalized 6-Piece Starter Capsule (idempotent, tagged for 1-tap cleanup)
  router.post(
    '/auth/onboarding/starter-capsule',
    requireStrictUserAuth,
    requirePermission('closet:write'),
    async (req, res) => {
      const authz = resolveAuthorizedClosets(req, req.user.defaultCloset, { mode: 'write' });
      if (!authz.ok) {
        return res.status(authz.status).json({ ok: false, error: authz.error });
      }
      const closetOwner = authz.primaryCloset;
      const body = req.body && typeof req.body === 'object' ? req.body : {};

      const result = await db.transaction(async () => {
        const userRow = (await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) || {};
        const personalColor = String(
          body.personalColor || body.personal_color || userRow.personal_color || 'autumn_warm'
        ).trim();
        const gender =
          normalizeBinaryGender(body.gender || userRow.gender) || 'male';
        const ageGroup =
          normalizeOnboardingAgeGroup(
            body.ageGroup || body.age_group || userRow.age_group,
            userRow.age
          ) || '30s';

        const curated = selectStarterCapsule6({ personalColor, gender, ageGroup });
        const existingRows = await db
          .prepare('SELECT image_url FROM garments WHERE closet_owner = ?')
          .all(closetOwner);
        const existingUrls = new Set(existingRows.map((r) => String(r.image_url || '')));

        const mergedSteps = {
          ...parseOnboardingStepsJson(userRow.onboarding_steps_json),
          closet_seed: 'capsule',
        };
        const nextStatus =
          userRow.onboarding_status === 'completed' ? 'completed' : 'in_progress';

        // Canonical lock order: update users first before inserting garments
        await db
          .prepare(
            `UPDATE users
             SET onboarding_status = ?,
                 onboarding_step = ?,
                 onboarding_steps_json = ?
             WHERE id = ?`
          )
          .run(nextStatus, 'first_tryon', JSON.stringify(mergedSteps), req.user.id);

        const insertStmt = db.prepare(`
          INSERT INTO garments (
            closet_owner, name, category, subcategory, color_name, color_hex,
            seasons, min_temp, max_temp, water_resistant, formality,
            brand, price, wear_count, status, image_url, notes,
            fabric, slot_key, base_glb, physics_preset, custom_texture
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?, ?, 0)
        `);

        const insertedGarments = [];
        for (const item of curated) {
          if (existingUrls.has(item.image_url)) continue;
          const spec = resolveManifestSlotAndGlb(item.category, item.subcategory);
          const inserted = await insertStmt.run(
            closetOwner,
            item.name,
            item.category,
            item.subcategory,
            item.color_name,
            item.color_hex,
            JSON.stringify(item.seasons),
            item.min_temp,
            item.max_temp,
            item.water_resistant ? 1 : 0,
            item.formality,
            item.brand,
            item.price,
            item.image_url,
            `${STARTER_CAPSULE_NOTE_TAG} 온보딩 맞춤 스타터 캡슐`,
            item.fabric || 'cotton',
            spec.slotKey,
            spec.baseGlb,
            spec.physicsPreset
          );
          existingUrls.add(item.image_url);
          const createdRow = await db
            .prepare('SELECT * FROM garments WHERE id = ?')
            .get(inserted.lastInsertRowid);
          if (createdRow) insertedGarments.push(parseGarmentRow(createdRow));
        }

        const updatedUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        return { curatedCount: curated.length, insertedGarments, updatedUser };
      });

      return res.status(201).json({
        ok: true,
        count: result.curatedCount,
        insertedCount: result.insertedGarments.length,
        garments: result.insertedGarments,
        user: await formatUserPayload(result.updatedUser),
      });
    }
  );

  // 4. One-Tap Starter Capsule Cleanup
  router.delete(
    '/auth/onboarding/starter-capsule',
    requireStrictUserAuth,
    requirePermission('closet:write'),
    async (req, res) => {
      const authz = resolveAuthorizedClosets(req, req.user.defaultCloset, { mode: 'write' });
      if (!authz.ok) {
        return res.status(authz.status).json({ ok: false, error: authz.error });
      }
      const closetOwner = authz.primaryCloset;

      const { removedCount, updatedUser } = await db.transaction(async () => {
        const info = await db
          .prepare('DELETE FROM garments WHERE closet_owner = ? AND notes LIKE ?')
          .run(closetOwner, `${STARTER_CAPSULE_NOTE_TAG}%`);
        const userAfter = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        return { removedCount: Number(info?.changes || 0), updatedUser: userAfter };
      });

      return res.json({
        ok: true,
        removedCount,
        user: await formatUserPayload(updatedUser),
      });
    }
  );

  // 5. Explicit Onboarding Completion (sets onboarding_status='completed' & locks confirmed gender)
  router.post(
    '/auth/onboarding/complete',
    requireStrictUserAuth,
    requirePermission('profile:write'),
    async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const nowIso = new Date().toISOString();

      const updatedUser = await db.transaction(async () => {
        const prevRow = (await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) || {};
        const mergedSteps = {
          ...parseOnboardingStepsJson(prevRow.onboarding_steps_json),
          ...(body.stepsPatch && typeof body.stepsPatch === 'object' ? body.stepsPatch : {}),
          first_tryon: true,
        };
        const shouldLockGender =
          isGenderLockEnforcedUser(prevRow) &&
          (prevRow.gender === 'male' || prevRow.gender === 'female')
            ? 1
            : Number(prevRow.gender_locked || 0);

        await db
          .prepare(`
            UPDATE users
            SET onboarding_status = 'completed',
                onboarding_step = 'first_tryon',
                onboarding_steps_json = ?,
                onboarding_completed_at = ?,
                profile_completed = 1,
                gender_locked = ?
            WHERE id = ?
          `)
          .run(JSON.stringify(mergedSteps), nowIso, shouldLockGender, req.user.id);

        return db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      });

      return res.json({
        ok: true,
        user: await formatUserPayload(updatedUser),
      });
    }
  );

  // 6. Re-open Onboarding Guide (preserves gender_locked permanently)
  router.post(
    '/auth/onboarding/reset',
    requireStrictUserAuth,
    requirePermission('profile:write'),
    async (req, res) => {
      const updatedUser = await db.transaction(async () => {
        await db
          .prepare(`
            UPDATE users
            SET onboarding_status = 'in_progress',
                onboarding_step = 'identity_body'
            WHERE id = ?
          `)
          .run(req.user.id);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      });

      return res.json({
        ok: true,
        user: await formatUserPayload(updatedUser),
      });
    }
  );
}
