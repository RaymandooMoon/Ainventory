import type { GarmentRecord, WearSlotKey } from '../contracts/carbonDesignContract.ts';
import {
  type AvatarSpec,
  DEFAULT_ISO_VIEW_ANGLE,
  bridgeLegacyPropsToAvatarSpec,
  normalizeViewAngleDeg,
  sanitizeAvatarSpec,
} from './avatarSpecStore.ts';
import {
  type BottomGarmentDrawPass,
  type GarmentCutoutAsset,
  type GarmentGeometryClassification,
  type GarmentInputRecord,
  type PairedLimbDrawPass,
  type ShoeGarmentDrawPass,
  type UpperGarmentDrawPass,
  classifyGarmentGeometry,
  createBottomGarmentWarpPass,
  createGlovesWarpPass,
  createShoeGarmentWarpPass,
  createSocksWarpPass,
  createUpperGarmentWarpPass,
  drawWarpedBag,
  drawWarpedBelt,
  drawWarpedEyewear,
  drawWarpedHeadwear,
  drawWarpedNeckwear,
  drawWarpedWatch,
  loadPreparedGarmentCutout,
  resolveBottomShoeOverlap,
} from './garmentPhotoWarper.ts';
import {
  type IsometricBodyFrame,
  computeIsometricBodyFrame,
  drawIsometricHeadFaceAndHair,
  drawIsometricLimbSegment,
  drawIsometricMinimalBasewear,
  drawIsometricStudioPlinth,
  drawIsometricTorsoAndNeck,
  loadFacePhotoImage,
} from './isometricBodyRig.ts';
import { findClosestMstFromHex } from './monkSkinTone.ts';
import { normalizeBodyShape } from './parametricAvatar3D.ts';
import { normalizeSeasonKey } from './skinToneAnalyzer.ts';

export interface EditorialModelSpec {
  skinToneHex: string;
  personalColor: string;
  heightCm: number;
  weightKg: number;
  bodyShape: string;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
  portraitDataUrl?: string | null;
}

export interface EditorialRenderInput {
  profile?: Partial<EditorialModelSpec> | null;
  avatarSpec?: AvatarSpec | null;
  viewAngleDeg?: number;
  // oxlint-disable-next-line typescript/no-explicit-any
  slots?: Record<string, any> | null;
  theme?: 'light' | 'dark';
  compact?: boolean;
  width?: number;
  height?: number;
}

interface PreparedGarmentEntry {
  garment: GarmentInputRecord;
  asset: GarmentCutoutAsset;
  classification: GarmentGeometryClassification;
}

interface UpperPassBundle {
  entry: PreparedGarmentEntry;
  pass: UpperGarmentDrawPass;
}

interface BottomPassBundle {
  entry: PreparedGarmentEntry;
  pass: BottomGarmentDrawPass;
}

interface ShoePassBundle {
  entry: PreparedGarmentEntry;
  pass: ShoeGarmentDrawPass;
}

interface PairedLimbPassBundle {
  entry: PreparedGarmentEntry;
  pass: PairedLimbDrawPass;
}

const VIRTUAL_W = 900;
const VIRTUAL_H = 1200;
const COMPACT_W = 360;
const COMPACT_H = 500;

const TRANSPARENT_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const CANONICAL_SLOT_SCAN_ORDER: readonly string[] = [
  'swimwear',
  'underwear',
  'socks',
  'top',
  'bottom',
  'onepiece',
  'dress',
  'outer',
  'shoes',
  'gloves',
  'belt',
  'watch',
  'neckwear',
  'eyewear',
  'headwear',
  'bag',
  'accessory',
];

const DIRECT_SLOT_HINTS = new Set<string>([
  'headwear',
  'neckwear',
  'outer',
  'top',
  'bottom',
  'dress',
  'gloves',
  'underwear',
  'socks',
  'shoes',
]);

const canvasRenderSequence = new WeakMap<HTMLCanvasElement, number>();

function isValidHex6(raw: unknown): raw is string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.trim());
}

function sanitizePortraitUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[object Object]') {
    return null;
  }
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/uploads/') ||
    (trimmed.startsWith('/seed/') && /\.(png|jpe?g|webp|avif|gif)(\?.*)?$/i.test(trimmed))
  ) {
    return trimmed;
  }
  return null;
}

/**
 * Resolves the canonical V2 `AvatarSpec` from either an explicit `input.avatarSpec`
 * or bridged legacy `input.profile` props (`heightCm: 140..205`, `weightKg: 35..160`,
 * `skinToneHex`, `personalColor`, `bodyShape`, `portraitDataUrl`).
 */
function resolveEffectiveAvatarSpec(input: EditorialRenderInput): AvatarSpec {
  const profile = input.profile ?? null;

  if (input.avatarSpec) {
    const base = sanitizeAvatarSpec(input.avatarSpec);
    const profileHex = isValidHex6(profile?.skinToneHex)
      ? profile.skinToneHex.trim().toUpperCase()
      : null;
    const baseHex = base.appearance.skinToneHex.trim().toUpperCase();
    const hexOverridden = Boolean(profileHex && profileHex !== baseHex);

    const nextAppearance = { ...base.appearance };
    if (hexOverridden && profileHex) {
      const closest = findClosestMstFromHex(profileHex);
      nextAppearance.skinToneHex = profileHex;
      nextAppearance.mstLevel = closest.level;
      nextAppearance.mstUndertone = closest.undertone;
    }
    if (typeof profile?.personalColor === 'string' && profile.personalColor.trim()) {
      nextAppearance.personalColor = normalizeSeasonKey(profile.personalColor);
    }
    if (!nextAppearance.facePhotoUrl) {
      const fallbackPhoto = sanitizePortraitUrl(profile?.portraitDataUrl);
      if (fallbackPhoto) {
        nextAppearance.facePhotoUrl = fallbackPhoto;
      }
    }

    return sanitizeAvatarSpec({
      ...base,
      appearance: nextAppearance,
    });
  }

  const portraitCandidate = sanitizePortraitUrl(profile?.portraitDataUrl);
  const bridged = bridgeLegacyPropsToAvatarSpec(
    profile
      ? {
          skinProfile: {
            ...(isValidHex6(profile.skinToneHex)
              ? { skinToneHex: profile.skinToneHex.trim().toUpperCase() }
              : {}),
            ...(typeof profile.personalColor === 'string' && profile.personalColor.trim()
              ? { personalColor: normalizeSeasonKey(profile.personalColor) }
              : {}),
            ...(portraitCandidate ? { portraitDataUrl: portraitCandidate } : {}),
          },
          bodySpec: {
            ...(typeof profile.heightCm === 'number' && Number.isFinite(profile.heightCm)
              ? { heightCm: profile.heightCm }
              : {}),
            ...(typeof profile.weightKg === 'number' && Number.isFinite(profile.weightKg)
              ? { weightKg: profile.weightKg }
              : {}),
            ...(typeof profile.bodyShape === 'string' && profile.bodyShape.trim()
              ? { bodyShape: normalizeBodyShape(profile.bodyShape) }
              : {}),
            ...(typeof profile.shoulderScale === 'number' && Number.isFinite(profile.shoulderScale)
              ? { shoulderScale: profile.shoulderScale }
              : {}),
            ...(typeof profile.waistScale === 'number' && Number.isFinite(profile.waistScale)
              ? { waistScale: profile.waistScale }
              : {}),
            ...(typeof profile.hipScale === 'number' && Number.isFinite(profile.hipScale)
              ? { hipScale: profile.hipScale }
              : {}),
          },
          personReferenceUrl: portraitCandidate,
        }
      : null
  );

  return bridged.spec;
}

function isRenderableGarmentObject(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const rec = raw as Record<string, unknown>;
  const hasId = rec.id !== undefined && rec.id !== null && String(rec.id).trim() !== '';
  const hasImage = typeof rec.image_url === 'string' && rec.image_url.trim().length > 0;
  const hasCategory = typeof rec.category === 'string' && rec.category.trim().length > 0;
  const hasSubcategory = typeof rec.subcategory === 'string' && rec.subcategory.trim().length > 0;
  const hasName = typeof rec.name === 'string' && rec.name.trim().length > 0;
  return hasId || hasImage || hasCategory || hasSubcategory || hasName;
}

/**
 * Extracts strictly equipped garment records (1:1 slot binding — zero fake fallback items)
 * while deduplicating identical object references or positive item IDs across slot aliases.
 */
// oxlint-disable-next-line typescript/no-explicit-any
function extractEquippedGarmentRecords(slots?: Record<string, any> | null): GarmentInputRecord[] {
  if (!slots || typeof slots !== 'object') return [];

  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const key of CANONICAL_SLOT_SCAN_ORDER) {
    if (key in slots) {
      orderedKeys.push(key);
      seenKeys.add(key);
    }
  }
  for (const key of Object.keys(slots)) {
    if (!seenKeys.has(key)) {
      orderedKeys.push(key);
      seenKeys.add(key);
    }
  }

  const seenRefs = new Set<object>();
  const seenPositiveIds = new Set<number>();
  const records: GarmentInputRecord[] = [];

  for (const slotKey of orderedKeys) {
    const rawVal = slots[slotKey];
    if (!isRenderableGarmentObject(rawVal)) continue;
    if (seenRefs.has(rawVal)) continue;

    const rawId = Number(rawVal.id);
    if (Number.isFinite(rawId) && rawId > 0) {
      if (seenPositiveIds.has(rawId)) continue;
      seenPositiveIds.add(rawId);
    }
    seenRefs.add(rawVal);

    const typed = rawVal as Partial<GarmentRecord> & GarmentInputRecord;
    const normalizedSlotHint = slotKey.trim().toLowerCase();
    const needsSlotHint =
      !typed.slot_key &&
      !typed.category &&
      !typed.subcategory &&
      DIRECT_SLOT_HINTS.has(normalizedSlotHint);

    if (needsSlotHint) {
      records.push({
        ...typed,
        slot_key: normalizedSlotHint as WearSlotKey,
      });
    } else if (!typed.slot_key && normalizedSlotHint === 'swimwear' && !typed.category) {
      records.push({
        ...typed,
        category: 'swimwear',
      });
    } else if (!typed.slot_key && normalizedSlotHint === 'onepiece' && !typed.category) {
      records.push({
        ...typed,
        slot_key: 'dress',
      });
    } else {
      records.push(typed);
    }
  }

  return records;
}

function drawStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  frame: IsometricBodyFrame,
  theme: 'light' | 'dark'
): void {
  ctx.save();
  const bgGrad = ctx.createRadialGradient(
    frame.centerX,
    frame.height * 0.42,
    frame.width * 0.08,
    frame.centerX,
    frame.height * 0.5,
    Math.max(frame.width, frame.height) * 0.78
  );
  if (theme === 'dark') {
    bgGrad.addColorStop(0, '#22242A');
    bgGrad.addColorStop(1, '#17181C');
  } else {
    // Luminous airy white studio backdrop keeping overall stage brightness > 240
    bgGrad.addColorStop(0, '#FFFFFF');
    bgGrad.addColorStop(1, '#F6F7FA');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.restore();
}

/**
 * Renders the 8-direction Isometric Parametric Avatar + Stage-1 Real-Photo Warped Garments
 * onto `canvas` with strict 1:1 item binding and zero abstract vector garment fallbacks.
 */
export async function renderEditorialFashionCanvas(
  canvas: HTMLCanvasElement,
  input: EditorialRenderInput
): Promise<void> {
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const renderSeq = (canvasRenderSequence.get(canvas) ?? 0) + 1;
  canvasRenderSequence.set(canvas, renderSeq);

  const isCompact = Boolean(input.compact);
  const targetW =
    typeof input.width === 'number' && input.width > 0
      ? Math.round(input.width)
      : isCompact
        ? COMPACT_W
        : VIRTUAL_W;
  const targetH =
    typeof input.height === 'number' && input.height > 0
      ? Math.round(input.height)
      : isCompact
        ? COMPACT_H
        : VIRTUAL_H;

  const theme: 'light' | 'dark' = input.theme === 'dark' ? 'dark' : 'light';
  const viewAngleDeg = normalizeViewAngleDeg(input.viewAngleDeg, DEFAULT_ISO_VIEW_ANGLE);
  const spec = resolveEffectiveAvatarSpec(input);
  const equippedRecords = extractEquippedGarmentRecords(input.slots);

  // Decode face portrait + all equipped real-photo garment cutouts in parallel before mutating canvas
  const [faceImage, loadedAssets] = await Promise.all([
    spec.appearance.facePhotoUrl
      ? loadFacePhotoImage(spec.appearance.facePhotoUrl)
      : Promise.resolve(null),
    Promise.all(equippedRecords.map((rec) => loadPreparedGarmentCutout(rec))),
  ]);

  // Drop stale async render if a newer render request was scheduled on the same canvas
  if (canvasRenderSequence.get(canvas) !== renderSeq) {
    return;
  }

  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const frame = computeIsometricBodyFrame({
    spec,
    angleDeg: viewAngleDeg,
    width: targetW,
    height: targetH,
    compact: isCompact,
    theme,
  });

  // Bucket prepared cutout assets by anatomical slot role
  const swimBottomEntries: PreparedGarmentEntry[] = [];
  const swimTopEntries: PreparedGarmentEntry[] = [];
  const sockEntries: PreparedGarmentEntry[] = [];
  const topEntries: PreparedGarmentEntry[] = [];
  const bottomEntries: PreparedGarmentEntry[] = [];
  const onepieceEntries: PreparedGarmentEntry[] = [];
  const beltEntries: PreparedGarmentEntry[] = [];
  const outerEntries: PreparedGarmentEntry[] = [];
  const shoeEntries: PreparedGarmentEntry[] = [];
  const gloveEntries: PreparedGarmentEntry[] = [];
  const watchEntries: PreparedGarmentEntry[] = [];
  const neckwearEntries: PreparedGarmentEntry[] = [];
  const eyewearEntries: PreparedGarmentEntry[] = [];
  const headwearEntries: PreparedGarmentEntry[] = [];
  const bagEntries: PreparedGarmentEntry[] = [];

  for (let i = 0; i < equippedRecords.length; i += 1) {
    const asset = loadedAssets[i];
    if (!asset) continue;
    const garment = equippedRecords[i];
    const classification = classifyGarmentGeometry(garment, asset);
    const entry: PreparedGarmentEntry = { garment, asset, classification };

    switch (classification.slotRole) {
      case 'swimwear':
        if (classification.isSwimBottomOnly) {
          swimBottomEntries.push(entry);
        } else {
          swimTopEntries.push(entry);
        }
        break;
      case 'socks':
        sockEntries.push(entry);
        break;
      case 'top':
        topEntries.push(entry);
        break;
      case 'bottom':
        bottomEntries.push(entry);
        break;
      case 'onepiece':
        onepieceEntries.push(entry);
        break;
      case 'belt':
        beltEntries.push(entry);
        break;
      case 'outer':
        outerEntries.push(entry);
        break;
      case 'shoes':
        shoeEntries.push(entry);
        break;
      case 'gloves':
        gloveEntries.push(entry);
        break;
      case 'watch':
        watchEntries.push(entry);
        break;
      case 'neckwear':
        neckwearEntries.push(entry);
        break;
      case 'eyewear':
        eyewearEntries.push(entry);
        break;
      case 'headwear':
        headwearEntries.push(entry);
        break;
      case 'bag':
        bagEntries.push(entry);
        break;
    }
  }

  // If a dress/onepiece is equipped and an identical bottom wasn't explicitly layered, keep both independent;
  // resolve overlap mode between primary bottom and primary footwear
  const primaryBottom = bottomEntries[bottomEntries.length - 1] ?? null;
  const primaryShoe = shoeEntries[shoeEntries.length - 1] ?? null;
  const overlapMode = resolveBottomShoeOverlap(primaryBottom?.garment, primaryShoe?.garment);
  const bottomCoversNearShoe =
    primaryBottom?.classification.bottomMode === 'midi_skirt' ||
    overlapMode === 'pants_over_shoes';

  // Barefoot remains 100% visible when no shoe is equipped OR when flip_flops / strap_sandals / slides are worn!
  const hasClosedShoe = shoeEntries.some((s) => !s.classification.isBarefootVisibleShoe);
  const hasGloves = gloveEntries.length > 0;
  const hatEquipped = headwearEntries.length > 0;

  const hasSwimOnepiece = swimTopEntries.some((s) => s.classification.isSwimOnepiece);
  const hasTopCoverage =
    topEntries.length > 0 ||
    outerEntries.length > 0 ||
    onepieceEntries.length > 0 ||
    swimTopEntries.length > 0;
  const hasBottomCoverage =
    bottomEntries.length > 0 ||
    onepieceEntries.length > 0 ||
    swimBottomEntries.length > 0 ||
    hasSwimOnepiece;
  const hasOnepieceCoverage = onepieceEntries.length > 0 || hasSwimOnepiece;

  // Build multi-angle mesh warp passes
  const sockPasses: PairedLimbPassBundle[] = sockEntries.map((entry) => ({
    entry,
    pass: createSocksWarpPass(ctx, frame, entry.asset),
  }));
  const swimBottomPasses: BottomPassBundle[] = swimBottomEntries.map((entry) => ({
    entry,
    pass: createBottomGarmentWarpPass(ctx, frame, entry.asset, entry.classification, overlapMode),
  }));
  const swimTopPasses: UpperPassBundle[] = swimTopEntries.map((entry) => ({
    entry,
    pass: createUpperGarmentWarpPass(ctx, frame, entry.asset, entry.garment),
  }));
  const topPasses: UpperPassBundle[] = topEntries.map((entry) => ({
    entry,
    pass: createUpperGarmentWarpPass(ctx, frame, entry.asset, entry.garment),
  }));
  const bottomPasses: BottomPassBundle[] = bottomEntries.map((entry) => ({
    entry,
    pass: createBottomGarmentWarpPass(ctx, frame, entry.asset, entry.classification, overlapMode),
  }));
  const onepiecePasses: UpperPassBundle[] = onepieceEntries.map((entry) => ({
    entry,
    pass: createUpperGarmentWarpPass(ctx, frame, entry.asset, entry.garment),
  }));
  const outerPasses: UpperPassBundle[] = outerEntries.map((entry) => ({
    entry,
    pass: createUpperGarmentWarpPass(ctx, frame, entry.asset, entry.garment),
  }));
  const shoePasses: ShoePassBundle[] = shoeEntries.map((entry) => ({
    entry,
    pass: createShoeGarmentWarpPass(ctx, frame, entry.asset, entry.garment),
  }));
  const glovePasses: PairedLimbPassBundle[] = gloveEntries.map((entry) => ({
    entry,
    pass: createGlovesWarpPass(ctx, frame, entry.asset),
  }));

  // ==========================================================================
  // STRICT 18-STAGE ISOMETRIC DEPTH Z-ORDER
  // ==========================================================================
  ctx.clearRect(0, 0, targetW, targetH);

  // 1. Studio Backdrop + Grounded Isometric Plinth
  drawStudioBackdrop(ctx, frame, theme);
  drawIsometricStudioPlinth(ctx, frame, theme);

  // 2. Back Hair Silhouette (behind neck & shoulders when facing front / 3/4 / profile)
  if (!frame.facingBack) {
    drawIsometricHeadFaceAndHair(ctx, frame, {
      hatEquipped,
      faceImage,
      drawPhase: 'back_hair',
    });
  }

  // 3. Far Bare Leg & Foot + Far Bare Arm
  drawIsometricLimbSegment(ctx, frame, 'leg', frame.farLegSide, {
    hideFoot: hasClosedShoe,
  });
  drawIsometricLimbSegment(ctx, frame, 'arm', frame.farArmSide, {
    hideHand: hasGloves,
  });

  // 4. Far Socks, Far Swimwear, Far Shoe <-> Far Pant Leg, Far Sleeves & Far Glove
  for (const s of sockPasses) s.pass.farLayer();
  for (const sb of swimBottomPasses) sb.pass.farLegPanel();

  if (bottomCoversNearShoe) {
    for (const sh of shoePasses) sh.pass.farShoe();
    for (const b of bottomPasses) b.pass.farLegPanel();
  } else {
    for (const b of bottomPasses) b.pass.farLegPanel();
    for (const sh of shoePasses) sh.pass.farShoe();
  }

  for (const st of swimTopPasses) st.pass.farSleeve();
  for (const t of topPasses) t.pass.farSleeve();
  for (const op of onepiecePasses) op.pass.farSleeve();
  for (const o of outerPasses) o.pass.farSleeve();
  for (const g of glovePasses) g.pass.farLayer();

  // 5. Sculpted Coupled Torso & Neck + Near Bare Leg & Foot + Near Socks
  drawIsometricTorsoAndNeck(ctx, frame);
  drawIsometricLimbSegment(ctx, frame, 'leg', frame.nearLegSide, {
    hideFoot: hasClosedShoe,
  });
  for (const s of sockPasses) s.pass.nearLayer();

  // 6. Minimal Seamless Athletic Basewear ONLY when corresponding region is bare
  drawIsometricMinimalBasewear(ctx, frame, {
    hasTop: hasTopCoverage,
    hasBottom: hasBottomCoverage,
    hasOnepiece: hasOnepieceCoverage,
  });

  // 7. Swimwear / Underlayer
  for (const sb of swimBottomPasses) sb.pass.nearLegPanel();
  for (const st of swimTopPasses) st.pass.bodyTorso();

  // 8. Tops Torso
  for (const t of topPasses) t.pass.bodyTorso();

  // 9. Bottoms <-> Near Shoes/Boots (branched by resolveBottomShoeOverlap)
  if (bottomCoversNearShoe) {
    for (const sh of shoePasses) sh.pass.nearShoe();
    for (const b of bottomPasses) b.pass.nearLegPanel();
  } else {
    for (const b of bottomPasses) b.pass.nearLegPanel();
    for (const sh of shoePasses) sh.pass.nearShoe();
  }

  // 10. One-piece / Dress
  for (const op of onepiecePasses) op.pass.bodyTorso();

  // 11. Belt (warped around waist/pelvis ring)
  for (const belt of beltEntries) {
    drawWarpedBelt(ctx, frame, belt.asset);
  }

  // 12. Outerwear Torso (blazer / cardigan / trench / coat / puffer)
  for (const o of outerPasses) o.pass.bodyTorso();

  // 13. Near Bare Arm & Hand
  drawIsometricLimbSegment(ctx, frame, 'arm', frame.nearArmSide, {
    hideHand: hasGloves,
  });

  // 14. Near Sleeves -> Near Gloves -> Wristwatch
  for (const st of swimTopPasses) st.pass.nearSleeve();
  for (const t of topPasses) t.pass.nearSleeve();
  for (const op of onepiecePasses) op.pass.nearSleeve();
  for (const o of outerPasses) o.pass.nearSleeve();
  for (const g of glovePasses) g.pass.nearLayer();
  for (const w of watchEntries) {
    drawWarpedWatch(ctx, frame, w.asset);
  }

  // 15. Neckwear / Muffler / Necktie
  for (const nw of neckwearEntries) {
    drawWarpedNeckwear(ctx, frame, nw.asset, nw.garment);
  }

  // 16. Head, Coupled Face, Portrait Composite & Crown/Front Hair (compressed when hatEquipped)
  drawIsometricHeadFaceAndHair(ctx, frame, {
    hatEquipped,
    faceImage,
    drawPhase: frame.facingBack ? 'all' : 'head_and_front_hair',
  });

  // 17. Eyewear -> Headwear
  for (const ew of eyewearEntries) {
    drawWarpedEyewear(ctx, frame, ew.asset);
  }
  for (const hw of headwearEntries) {
    drawWarpedHeadwear(ctx, frame, hw.asset, hw.garment);
  }

  // 18. Handheld Tote / Briefcase or Crossbody Shoulder Bag
  for (const bag of bagEntries) {
    drawWarpedBag(ctx, frame, bag.asset, bag.garment);
  }

  if (canvas.dataset) {
    canvas.dataset.bodyReady = 'true';
    canvas.dataset.isoAngle = String(frame.angleDeg);
  }
}

export async function synthesizeEditorial2DDataUrl(
  input: EditorialRenderInput
): Promise<string> {
  if (typeof document === 'undefined') {
    return TRANSPARENT_1X1_PNG;
  }
  const canvas = document.createElement('canvas');
  try {
    await renderEditorialFashionCanvas(canvas, input);
    return canvas.toDataURL('image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
