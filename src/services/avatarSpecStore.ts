import { useSyncExternalStore } from 'react';
import {
  type MstLevel,
  type MstUndertone,
  findClosestMstFromHex,
  getMstSwatch,
  isMstLevel,
  normalizeMstLevel,
  normalizeMstUndertone,
} from './monkSkinTone.ts';
import {
  type BodyMorphSpec,
  type BodyShapeKey,
  getStoredBodySpec,
  normalizeBodyShape,
  sanitizeBodySpec,
} from './parametricAvatar3D.ts';
import {
  type PersonalColorSeasonKey,
  type StoredSkinProfile,
  getStoredSkinProfile,
  normalizeSeasonKey,
} from './skinToneAnalyzer.ts';

export const AVATAR_SPEC_STORAGE_KEY = 'ainventory_avatar_spec_v2';

export type AvatarFramePreset = 'feminine' | 'masculine' | 'androgynous' | 'custom';

export type AvatarArchetypePreset =
  | 'hourglass'
  | 'inverted_triangle'
  | 'pear'
  | 'apple'
  | 'rectangle'
  | 'athletic'
  | 'petite'
  | 'plus_size';

export type ChestContourForm = 'flat' | 'pectoral' | 'contoured' | 'full_bust';

export type AvatarHairStyle =
  | 'buzz_shaved'
  | 'pixie_short'
  | 'straight_bob'
  | 'long_straight'
  | 'soft_wavy'
  | 'loose_curly'
  | 'type4_coily_afro'
  | 'box_braids_locs'
  | 'hijab_headwrap';

export type AvatarFacialHair =
  | 'none'
  | 'stubble'
  | 'mustache'
  | 'goatee'
  | 'short_boxed_beard'
  | 'full_beard';

export type AvatarHeadShape = 'oval' | 'round' | 'square' | 'heart' | 'long';

export type AvatarEyeShape =
  | 'almond'
  | 'monolid'
  | 'hooded'
  | 'deep_set'
  | 'upturned'
  | 'round';

export type AvatarViewAngleDeg = 0 | 45 | 90 | 135 | 180 | -135 | -90 | -45;

export const ALL_ISO_VIEW_ANGLES = [45, 0, -45, -90, -135, 180, 135, 90] as const;

export const DEFAULT_ISO_VIEW_ANGLE: AvatarViewAngleDeg = 45;

export interface AvatarAnthropometrics {
  heightCm: number;
  weightKg: number;
  shoulderScale: number;
  chestScale: number;
  chestForm: ChestContourForm;
  waistScale: number;
  abdomenScale: number;
  hipScale: number;
  gluteScale: number;
  armMassScale: number;
  legMassScale: number;
  legLengthScale: number;
  muscleDefinition: number;
}

export interface AvatarCoupledSoftTissue {
  autoCoupleWithBmi: boolean;
  faceSoftnessBias: number;
  neckThicknessBias: number;
  torsoSoftnessBias: number;
  limbSoftnessBias: number;
  extremityPlumpnessBias: number;
}

export interface AvatarAppearance {
  mstLevel: MstLevel;
  mstUndertone: MstUndertone;
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  headShape: AvatarHeadShape;
  eyeShape: AvatarEyeShape;
  eyeSizeScale: number;
  noseWidthScale: number;
  lipFullnessScale: number;
  browStrength: number;
  hairStyle: AvatarHairStyle;
  hairColorHex: string;
  facialHair: AvatarFacialHair;
  facePhotoUrl: string | null;
}

export interface AvatarSpec {
  version: 2;
  framePreset: AvatarFramePreset;
  archetypePreset: AvatarArchetypePreset;
  anthropometrics: AvatarAnthropometrics;
  coupledSoftTissue: AvatarCoupledSoftTissue;
  appearance: AvatarAppearance;
}

export interface AvatarSpecPatch {
  framePreset?: AvatarFramePreset;
  archetypePreset?: AvatarArchetypePreset;
  anthropometrics?: Partial<AvatarAnthropometrics>;
  coupledSoftTissue?: Partial<AvatarCoupledSoftTissue>;
  appearance?: Partial<AvatarAppearance>;
}

export interface AvatarOptionItem<K extends string> {
  key: K;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  descKo?: string;
  descEn?: string;
}

export interface AvatarArchetypeOption extends AvatarOptionItem<AvatarArchetypePreset> {
  legacyBodyShape: BodyShapeKey;
}

export interface HairColorSwatchOption extends AvatarOptionItem<string> {
  hex: string;
}

export interface IsoViewAngleOption {
  angleDeg: AvatarViewAngleDeg;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
}

export interface CoupledBodyMetrics {
  bmi: number;
  bmiSoftIndex: number;
  heightScale: number;
  // Head & Neck
  headWidth: number;
  headHeight: number;
  cheekFullness: number;
  jawSoftness: number;
  submentalFullness: number;
  neckWidth: number;
  neckDepth: number;
  // Torso
  shoulderHalfWidth: number;
  shoulderSlope: number;
  ribcageWidth: number;
  ribcageDepth: number;
  chestForm: ChestContourForm;
  chestProjection: number;
  bustWidth: number;
  waistHalfWidth: number;
  waistDepth: number;
  abdomenProjection: number;
  pelvisHalfWidth: number;
  hipDepth: number;
  gluteProjection: number;
  // Upper Limbs & Hands
  upperArmRadius: number;
  forearmRadius: number;
  wristRadius: number;
  handWidth: number;
  handThickness: number;
  fingerThickness: number;
  // Lower Limbs & Feet
  thighRadius: number;
  kneeRadius: number;
  calfRadius: number;
  ankleRadius: number;
  footWidth: number;
  footLength: number;
  instepHeight: number;
}

export interface AvatarSpecSnapshot {
  spec: AvatarSpec;
  avatarConfigHash: string;
}

export interface LegacyAvatarBridgeInput {
  skinProfile?:
    | (Partial<StoredSkinProfile> & {
        portraitDataUrl?: string | null;
        previewDataUrl?: string | null;
        photoUrl?: string | null;
      })
    | null;
  bodySpec?: Partial<BodyMorphSpec> | null;
  user?: {
    gender?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    bodyShape?: string | null;
    skinToneHex?: string | null;
    personalColor?: string | null;
    personalColorLabelKo?: string | null;
    portraitUrl?: string | null;
    faceImageUrl?: string | null;
    avatarUrl?: string | null;
    photoUrl?: string | null;
    isSampleDemo?: boolean;
  } | null;
  personReferenceUrl?: string | null;
}

export const AVATAR_FRAME_OPTIONS: readonly AvatarOptionItem<AvatarFramePreset>[] = [
  {
    key: 'feminine',
    labelKo: '페미닌 프레임',
    labelEn: 'Feminine Frame',
    shortKo: '페미닌',
    shortEn: 'Feminine',
    descKo: '부드러운 어깨선과 자연스러운 골반·허리 곡선 베이스',
    descEn: 'Soft shoulder slope with contoured waist-to-pelvis proportions',
  },
  {
    key: 'masculine',
    labelKo: '매스큘린 프레임',
    labelEn: 'Masculine Frame',
    shortKo: '매스큘린',
    shortEn: 'Masculine',
    descKo: '넓은 흉곽·어깨 프레임과 직선적인 골반 베이스',
    descEn: 'Broader clavicle and ribcage frame with straighter pelvis lines',
  },
  {
    key: 'androgynous',
    labelKo: '앤드로지너스 중성 프레임',
    labelEn: 'Androgynous Frame',
    shortKo: '중성형',
    shortEn: 'Androgynous',
    descKo: '젠더 구애 없이 균형 잡힌 모던 에디토리얼 프로포션',
    descEn: 'Balanced gender-inclusive editorial proportions',
  },
  {
    key: 'custom',
    labelKo: '커스텀 자유 설계',
    labelEn: 'Custom Proportions',
    shortKo: '커스텀',
    shortEn: 'Custom',
    descKo: '모든 신체 부위 슬라이더를 제약 없이 세밀하게 조정',
    descEn: 'Unrestricted fine-grained control across every anatomical region',
  },
] as const;

export const AVATAR_ARCHETYPE_OPTIONS: readonly AvatarArchetypeOption[] = [
  {
    key: 'hourglass',
    labelKo: '아워글래스',
    labelEn: 'Hourglass',
    shortKo: '아워글래스',
    shortEn: 'Hourglass',
    descKo: '어깨와 골반이 균형을 이루며 잘록한 허리 라인',
    descEn: 'Balanced bust/shoulders and hips with a defined waist',
    legacyBodyShape: 'standard_balanced',
  },
  {
    key: 'inverted_triangle',
    labelKo: '역삼각형 · 상체 발달',
    labelEn: 'Inverted Triangle',
    shortKo: '역삼각형',
    shortEn: 'Broad Top',
    descKo: '시원한 어깨 프레임과 슬림한 골반·하체 실루엣',
    descEn: 'Broader shoulder line tapering cleanly to narrower hips',
    legacyBodyShape: 'upper_developed',
  },
  {
    key: 'pear',
    labelKo: '페어 · 하체 볼륨',
    labelEn: 'Pear',
    shortKo: '페어',
    shortEn: 'Pear',
    descKo: '차분한 상체와 안정감 있는 힙·허벅지 볼륨',
    descEn: 'Slender upper torso with fuller hip and thigh curves',
    legacyBodyShape: 'lower_developed',
  },
  {
    key: 'apple',
    labelKo: '애플 · 복부 중심',
    labelEn: 'Apple',
    shortKo: '애플',
    shortEn: 'Apple',
    descKo: '흉곽과 복부 중심에 볼륨이 모이는 라운드 토르소',
    descEn: 'Fuller midsection and ribcage with proportioned limbs',
    legacyBodyShape: 'lower_developed',
  },
  {
    key: 'rectangle',
    labelKo: '렉탱글 · 스트레이트',
    labelEn: 'Rectangle',
    shortKo: '렉탱글',
    shortEn: 'Rectangle',
    descKo: '어깨·허리·골반 폭이 깔끔하게 이어지는 모던 실루엣',
    descEn: 'Clean straight alignment across shoulders, waist, and hips',
    legacyBodyShape: 'standard_balanced',
  },
  {
    key: 'athletic',
    labelKo: '애슬레틱 · 탄탄 머슬',
    labelEn: 'Athletic',
    shortKo: '애슬레틱',
    shortEn: 'Athletic',
    descKo: '발달한 삼각근·광배근과 탄탄한 팔다리 근육 볼륨',
    descEn: 'Toned deltoids, defined torso, and sculpted limbs',
    legacyBodyShape: 'muscular',
  },
  {
    key: 'petite',
    labelKo: '쁘띠 · 슬림',
    labelEn: 'Petite Slim',
    shortKo: '쁘띠 슬림',
    shortEn: 'Petite',
    descKo: '가볍고 여리여리한 골격과 슬림한 사지 두께',
    descEn: 'Compact, slender bone structure and lean limbs',
    legacyBodyShape: 'slim',
  },
  {
    key: 'plus_size',
    labelKo: '플러스 사이즈 · 풀 커브',
    labelEn: 'Plus Size',
    shortKo: '플러스',
    shortEn: 'Plus Size',
    descKo: '볼·턱선·팔뚝·복부·손발까지 자연스럽게 연결된 풍성한 볼륨',
    descEn: 'Full-bodied soft-tissue curves across torso, face, and limbs',
    legacyBodyShape: 'lower_developed',
  },
] as const;

export const CHEST_FORM_OPTIONS: readonly AvatarOptionItem<ChestContourForm>[] = [
  {
    key: 'flat',
    labelKo: '플랫 · 미니멀',
    labelEn: 'Flat Contour',
    shortKo: '플랫',
    shortEn: 'Flat',
  },
  {
    key: 'pectoral',
    labelKo: '펙토럴 · 탄탄한 흉곽',
    labelEn: 'Sculpted Pectoral',
    shortKo: '펙토럴',
    shortEn: 'Pectoral',
  },
  {
    key: 'contoured',
    labelKo: '소프트 컨투어 바스트',
    labelEn: 'Soft Contoured',
    shortKo: '컨투어',
    shortEn: 'Contoured',
  },
  {
    key: 'full_bust',
    labelKo: '풀 볼륨 바스트',
    labelEn: 'Full Bust',
    shortKo: '풀 바스트',
    shortEn: 'Full Bust',
  },
] as const;

export const HAIR_STYLE_OPTIONS: readonly AvatarOptionItem<AvatarHairStyle>[] = [
  {
    key: 'buzz_shaved',
    labelKo: '버즈 · 쉐이브드',
    labelEn: 'Buzz / Shaved',
    shortKo: '버즈컷',
    shortEn: 'Buzz',
  },
  {
    key: 'pixie_short',
    labelKo: '픽시 · 테이퍼 숏',
    labelEn: 'Pixie / Taper Short',
    shortKo: '숏컷',
    shortEn: 'Short',
  },
  {
    key: 'straight_bob',
    labelKo: '슬릭 태슬 보브',
    labelEn: 'Sleek Bob',
    shortKo: '단발 보브',
    shortEn: 'Bob',
  },
  {
    key: 'long_straight',
    labelKo: '롱 스트레이트',
    labelEn: 'Long Straight',
    shortKo: '롱 스트레이트',
    shortEn: 'Straight',
  },
  {
    key: 'soft_wavy',
    labelKo: '소프트 레이어드 웨이브',
    labelEn: 'Soft Layered Waves',
    shortKo: '소프트 웨이브',
    shortEn: 'Wavy',
  },
  {
    key: 'loose_curly',
    labelKo: '루즈 볼륨 컬',
    labelEn: 'Loose Curls',
    shortKo: '루즈 컬',
    shortEn: 'Curly',
  },
  {
    key: 'type4_coily_afro',
    labelKo: '코일리 아프로 (Type 4)',
    labelEn: 'Type 4 Coily Afro',
    shortKo: '아프로 코일',
    shortEn: 'Coily Afro',
  },
  {
    key: 'box_braids_locs',
    labelKo: '박스 브레이드 · 록스',
    labelEn: 'Box Braids / Locs',
    shortKo: '브레이드',
    shortEn: 'Braids / Locs',
  },
  {
    key: 'hijab_headwrap',
    labelKo: '모던 히잡 · 헤드랩',
    labelEn: 'Hijab / Headwrap',
    shortKo: '히잡 · 랩',
    shortEn: 'Headwrap',
  },
] as const;

export const HAIR_COLOR_SWATCHES: readonly HairColorSwatchOption[] = [
  {
    key: 'jet_black',
    hex: '#16161A',
    labelKo: '제트 블랙',
    labelEn: 'Jet Black',
    shortKo: '블랙',
    shortEn: 'Black',
  },
  {
    key: 'natural_espresso',
    hex: '#2B211B',
    labelKo: '내추럴 에스프레소',
    labelEn: 'Natural Espresso',
    shortKo: '에스프레소',
    shortEn: 'Espresso',
  },
  {
    key: 'dark_chestnut',
    hex: '#4A3223',
    labelKo: '다크 체스트넛',
    labelEn: 'Dark Chestnut',
    shortKo: '체스트넛',
    shortEn: 'Chestnut',
  },
  {
    key: 'warm_caramel',
    hex: '#7B5335',
    labelKo: '웜 카라멜 브라운',
    labelEn: 'Warm Caramel',
    shortKo: '카라멜',
    shortEn: 'Caramel',
  },
  {
    key: 'auburn_copper',
    hex: '#8C3F27',
    labelKo: '오번 코퍼',
    labelEn: 'Auburn Copper',
    shortKo: '오번 코퍼',
    shortEn: 'Auburn',
  },
  {
    key: 'honey_blonde',
    hex: '#C89D66',
    labelKo: '허니 블론드',
    labelEn: 'Honey Blonde',
    shortKo: '허니 블론드',
    shortEn: 'Blonde',
  },
  {
    key: 'platinum_ash',
    hex: '#DDD8CF',
    labelKo: '플래티넘 애쉬',
    labelEn: 'Platinum Ash',
    shortKo: '플래티넘',
    shortEn: 'Platinum',
  },
  {
    key: 'silver_salt',
    hex: '#9498A1',
    labelKo: '실버 그레이',
    labelEn: 'Silver Grey',
    shortKo: '실버',
    shortEn: 'Silver',
  },
  {
    key: 'burgundy_plum',
    hex: '#542132',
    labelKo: '딥 버건디 플럼',
    labelEn: 'Burgundy Plum',
    shortKo: '버건디',
    shortEn: 'Burgundy',
  },
] as const;

export const FACIAL_HAIR_OPTIONS: readonly AvatarOptionItem<AvatarFacialHair>[] = [
  {
    key: 'none',
    labelKo: '없음 (클린 쉐이브)',
    labelEn: 'Clean Shaven',
    shortKo: '없음',
    shortEn: 'None',
  },
  {
    key: 'stubble',
    labelKo: '라이트 스터블',
    labelEn: 'Light Stubble',
    shortKo: '스터블',
    shortEn: 'Stubble',
  },
  {
    key: 'mustache',
    labelKo: '머스태시 (콧수염)',
    labelEn: 'Mustache',
    shortKo: '머스태시',
    shortEn: 'Mustache',
  },
  {
    key: 'goatee',
    labelKo: '고티 (턱·콧수염)',
    labelEn: 'Goatee',
    shortKo: '고티',
    shortEn: 'Goatee',
  },
  {
    key: 'short_boxed_beard',
    labelKo: '숏 박스드 비어드',
    labelEn: 'Short Boxed Beard',
    shortKo: '숏 비어드',
    shortEn: 'Short Beard',
  },
  {
    key: 'full_beard',
    labelKo: '풀 비어드',
    labelEn: 'Full Beard',
    shortKo: '풀 비어드',
    shortEn: 'Full Beard',
  },
] as const;

export const HEAD_SHAPE_OPTIONS: readonly AvatarOptionItem<AvatarHeadShape>[] = [
  {
    key: 'oval',
    labelKo: '오벌 (계란형)',
    labelEn: 'Oval',
    shortKo: '계란형',
    shortEn: 'Oval',
  },
  {
    key: 'round',
    labelKo: '라운드 (둥근형)',
    labelEn: 'Round',
    shortKo: '둥근형',
    shortEn: 'Round',
  },
  {
    key: 'square',
    labelKo: '스퀘어 (각진형)',
    labelEn: 'Square',
    shortKo: '스퀘어',
    shortEn: 'Square',
  },
  {
    key: 'heart',
    labelKo: '하트형',
    labelEn: 'Heart',
    shortKo: '하트형',
    shortEn: 'Heart',
  },
  {
    key: 'long',
    labelKo: '롱 (긴 얼굴형)',
    labelEn: 'Oblong',
    shortKo: '긴형',
    shortEn: 'Oblong',
  },
] as const;

export const EYE_SHAPE_OPTIONS: readonly AvatarOptionItem<AvatarEyeShape>[] = [
  {
    key: 'almond',
    labelKo: '아몬드형',
    labelEn: 'Almond',
    shortKo: '아몬드',
    shortEn: 'Almond',
  },
  {
    key: 'monolid',
    labelKo: '모노리드 (무쌍)',
    labelEn: 'Monolid',
    shortKo: '모노리드',
    shortEn: 'Monolid',
  },
  {
    key: 'hooded',
    labelKo: '후디드 (속쌍꺼풀)',
    labelEn: 'Hooded',
    shortKo: '속쌍',
    shortEn: 'Hooded',
  },
  {
    key: 'deep_set',
    labelKo: '딥셋 (깊은 눈매)',
    labelEn: 'Deep-Set',
    shortKo: '딥셋',
    shortEn: 'Deep-Set',
  },
  {
    key: 'upturned',
    labelKo: '업턴 (올라간 눈매)',
    labelEn: 'Upturned',
    shortKo: '업턴',
    shortEn: 'Upturned',
  },
  {
    key: 'round',
    labelKo: '라운드 (둥근 눈매)',
    labelEn: 'Round',
    shortKo: '라운드',
    shortEn: 'Round',
  },
] as const;

export const MST_UNDERTONE_OPTIONS: readonly AvatarOptionItem<MstUndertone>[] = [
  {
    key: 'cool',
    labelKo: '쿨 언더톤 (로지 · 플럼)',
    labelEn: 'Cool Undertone (Rosy / Plum)',
    shortKo: '쿨',
    shortEn: 'Cool',
  },
  {
    key: 'neutral',
    labelKo: '뉴트럴 언더톤 (밸런스)',
    labelEn: 'Neutral Undertone (Balanced)',
    shortKo: '뉴트럴',
    shortEn: 'Neutral',
  },
  {
    key: 'warm',
    labelKo: '웜 언더톤 (골든 · 피치)',
    labelEn: 'Warm Undertone (Golden / Peach)',
    shortKo: '웜',
    shortEn: 'Warm',
  },
  {
    key: 'olive',
    labelKo: '올리브 언더톤 (뮤트 골든그린)',
    labelEn: 'Olive Undertone (Muted Golden-Green)',
    shortKo: '올리브',
    shortEn: 'Olive',
  },
] as const;

export const ISO_VIEW_ANGLE_OPTIONS: readonly IsoViewAngleOption[] = [
  { angleDeg: 45, labelKo: '45° 쿼터 정면', labelEn: '45° Quarter Front', shortKo: '45°', shortEn: '45°' },
  { angleDeg: 0, labelKo: '0° 정면', labelEn: '0° Front', shortKo: '정면', shortEn: '0°' },
  { angleDeg: -45, labelKo: '-45° 좌측 쿼터', labelEn: '-45° Quarter Left', shortKo: '-45°', shortEn: '-45°' },
  { angleDeg: -90, labelKo: '-90° 좌측면', labelEn: '-90° Left Profile', shortKo: '좌측', shortEn: '-90°' },
  { angleDeg: -135, labelKo: '-135° 좌측 후면', labelEn: '-135° Back Left', shortKo: '-135°', shortEn: '-135°' },
  { angleDeg: 180, labelKo: '180° 후면', labelEn: '180° Back', shortKo: '후면', shortEn: '180°' },
  { angleDeg: 135, labelKo: '135° 우측 후면', labelEn: '135° Back Right', shortKo: '135°', shortEn: '135°' },
  { angleDeg: 90, labelKo: '90° 우측면', labelEn: '90° Right Profile', shortKo: '우측', shortEn: '90°' },
] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundTo(v: number, decimals = 3): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

function sanitizeFiniteNumber(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
  decimals = 2
): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return roundTo(clamp(n, min, max), decimals);
}

function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return fallback;
}

function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s === 'null' || s === 'undefined' || s === '[object Object]') {
    return null;
  }
  if (
    s.startsWith('data:image/') ||
    s.startsWith('blob:') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('/')
  ) {
    return s;
  }
  return null;
}

export function normalizeFramePreset(
  raw: unknown,
  fallback: AvatarFramePreset = 'androgynous'
): AvatarFramePreset {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'feminine' || s === 'female') return 'feminine';
  if (s === 'masculine' || s === 'male') return 'masculine';
  if (s === 'androgynous' || s === 'neutral') return 'androgynous';
  if (s === 'custom') return 'custom';
  return fallback;
}

export function normalizeArchetypePreset(
  raw: unknown,
  fallback: AvatarArchetypePreset = 'rectangle'
): AvatarArchetypePreset {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    s === 'hourglass' ||
    s === 'inverted_triangle' ||
    s === 'pear' ||
    s === 'apple' ||
    s === 'rectangle' ||
    s === 'athletic' ||
    s === 'petite' ||
    s === 'plus_size'
  ) {
    return s;
  }
  // Legacy BodyShapeKey mapping
  if (s === 'muscular' || s === 'athletic_muscular' || s === 'muscular_athletic') {
    return 'athletic';
  }
  if (s === 'slim' || s === 'slim_lean' || s === 'lean') {
    return 'petite';
  }
  if (s === 'upper_developed' || s === 'broad') {
    return 'inverted_triangle';
  }
  if (s === 'lower_developed' || s === 'curvy') {
    return 'pear';
  }
  if (s === 'plus_curvy') {
    return 'plus_size';
  }
  if (s === 'standard_balanced') {
    return fallback === 'hourglass' ? 'hourglass' : 'rectangle';
  }
  return fallback;
}

export function normalizeChestForm(
  raw: unknown,
  fallback: ChestContourForm = 'flat'
): ChestContourForm {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'flat' || s === 'pectoral' || s === 'contoured' || s === 'full_bust') {
    return s;
  }
  return fallback;
}

export function normalizeHairStyle(
  raw: unknown,
  fallback: AvatarHairStyle = 'soft_wavy'
): AvatarHairStyle {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    s === 'buzz_shaved' ||
    s === 'pixie_short' ||
    s === 'straight_bob' ||
    s === 'long_straight' ||
    s === 'soft_wavy' ||
    s === 'loose_curly' ||
    s === 'type4_coily_afro' ||
    s === 'box_braids_locs' ||
    s === 'hijab_headwrap'
  ) {
    return s;
  }
  return fallback;
}

export function normalizeFacialHair(
  raw: unknown,
  fallback: AvatarFacialHair = 'none'
): AvatarFacialHair {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    s === 'none' ||
    s === 'stubble' ||
    s === 'mustache' ||
    s === 'goatee' ||
    s === 'short_boxed_beard' ||
    s === 'full_beard'
  ) {
    return s;
  }
  return fallback;
}

export function normalizeHeadShape(
  raw: unknown,
  fallback: AvatarHeadShape = 'oval'
): AvatarHeadShape {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'oval' || s === 'round' || s === 'square' || s === 'heart' || s === 'long') {
    return s;
  }
  return fallback;
}

export function normalizeEyeShape(
  raw: unknown,
  fallback: AvatarEyeShape = 'almond'
): AvatarEyeShape {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    s === 'almond' ||
    s === 'monolid' ||
    s === 'hooded' ||
    s === 'deep_set' ||
    s === 'upturned' ||
    s === 'round'
  ) {
    return s;
  }
  return fallback;
}

export function normalizeViewAngleDeg(
  raw: unknown,
  fallback: AvatarViewAngleDeg = DEFAULT_ISO_VIEW_ANGLE
): AvatarViewAngleDeg {
  const n = Math.round(Number(raw));
  for (const valid of ALL_ISO_VIEW_ANGLES) {
    if (n === valid) return valid;
  }
  return fallback;
}

function defaultChestFormForFrame(framePreset: AvatarFramePreset): ChestContourForm {
  if (framePreset === 'feminine') return 'contoured';
  if (framePreset === 'masculine') return 'pectoral';
  return 'flat';
}

function defaultArchetypeForFrame(framePreset: AvatarFramePreset): AvatarArchetypePreset {
  if (framePreset === 'feminine') return 'hourglass';
  return 'rectangle';
}

function defaultHairForFrame(framePreset: AvatarFramePreset): AvatarHairStyle {
  if (framePreset === 'masculine') return 'pixie_short';
  return 'soft_wavy';
}

export function getDefaultAvatarSpec(
  framePreset: AvatarFramePreset = 'androgynous'
): AvatarSpec {
  const safeFrame = normalizeFramePreset(framePreset, 'androgynous');
  const defaultMst = findClosestMstFromHex('#DFBA9B');
  const heightCm = safeFrame === 'feminine' ? 164 : safeFrame === 'masculine' ? 176 : 170;
  const weightKg = safeFrame === 'feminine' ? 54 : safeFrame === 'masculine' ? 70 : 62;

  return {
    version: 2,
    framePreset: safeFrame,
    archetypePreset: defaultArchetypeForFrame(safeFrame),
    anthropometrics: {
      heightCm,
      weightKg,
      shoulderScale: 1,
      chestScale: 1,
      chestForm: defaultChestFormForFrame(safeFrame),
      waistScale: 1,
      abdomenScale: 1,
      hipScale: 1,
      gluteScale: 1,
      armMassScale: 1,
      legMassScale: 1,
      legLengthScale: 1,
      muscleDefinition: safeFrame === 'masculine' ? 0.42 : 0.3,
    },
    coupledSoftTissue: {
      autoCoupleWithBmi: true,
      faceSoftnessBias: 0,
      neckThicknessBias: 0,
      torsoSoftnessBias: 0,
      limbSoftnessBias: 0,
      extremityPlumpnessBias: 0,
    },
    appearance: {
      mstLevel: defaultMst.level,
      mstUndertone: defaultMst.undertone,
      skinToneHex: '#DFBA9B',
      personalColor: 'autumn_warm',
      headShape: 'oval',
      eyeShape: 'almond',
      eyeSizeScale: 1,
      noseWidthScale: 1,
      lipFullnessScale: 1,
      browStrength: 1,
      hairStyle: defaultHairForFrame(safeFrame),
      hairColorHex: '#2B211B',
      facialHair: 'none',
      facePhotoUrl: null,
    },
  };
}

/**
 * Safely validates and clamps any raw/partial input into a complete `AvatarSpec` (`version: 2`).
 */
export function sanitizeAvatarSpec(raw?: unknown): AvatarSpec {
  if (!raw || typeof raw !== 'object') {
    return getDefaultAvatarSpec('androgynous');
  }

  const obj = raw as Record<string, unknown>;
  const framePreset = normalizeFramePreset(obj.framePreset, 'androgynous');
  const base = getDefaultAvatarSpec(framePreset);

  const archetypePreset = normalizeArchetypePreset(
    obj.archetypePreset,
    base.archetypePreset
  );

  const rawAnthro =
    obj.anthropometrics && typeof obj.anthropometrics === 'object'
      ? (obj.anthropometrics as Record<string, unknown>)
      : {};

  const heightCm = Math.round(
    sanitizeFiniteNumber(rawAnthro.heightCm ?? obj.heightCm, base.anthropometrics.heightCm, 140, 205, 0)
  );
  const weightKg = Math.round(
    sanitizeFiniteNumber(rawAnthro.weightKg ?? obj.weightKg, base.anthropometrics.weightKg, 35, 160, 0)
  );

  const anthropometrics: AvatarAnthropometrics = {
    heightCm,
    weightKg,
    shoulderScale: sanitizeFiniteNumber(rawAnthro.shoulderScale, 1, 0.75, 1.35, 2),
    chestScale: sanitizeFiniteNumber(rawAnthro.chestScale, 1, 0.75, 1.4, 2),
    chestForm: normalizeChestForm(rawAnthro.chestForm, base.anthropometrics.chestForm),
    waistScale: sanitizeFiniteNumber(rawAnthro.waistScale, 1, 0.7, 1.35, 2),
    abdomenScale: sanitizeFiniteNumber(rawAnthro.abdomenScale, 1, 0.75, 1.45, 2),
    hipScale: sanitizeFiniteNumber(rawAnthro.hipScale, 1, 0.8, 1.38, 2),
    gluteScale: sanitizeFiniteNumber(rawAnthro.gluteScale, 1, 0.75, 1.4, 2),
    armMassScale: sanitizeFiniteNumber(rawAnthro.armMassScale, 1, 0.75, 1.45, 2),
    legMassScale: sanitizeFiniteNumber(rawAnthro.legMassScale, 1, 0.75, 1.45, 2),
    legLengthScale: sanitizeFiniteNumber(rawAnthro.legLengthScale, 1, 0.88, 1.12, 2),
    muscleDefinition: sanitizeFiniteNumber(
      rawAnthro.muscleDefinition,
      base.anthropometrics.muscleDefinition,
      0,
      1,
      2
    ),
  };

  const rawSoft =
    obj.coupledSoftTissue && typeof obj.coupledSoftTissue === 'object'
      ? (obj.coupledSoftTissue as Record<string, unknown>)
      : {};

  const coupledSoftTissue: AvatarCoupledSoftTissue = {
    autoCoupleWithBmi:
      typeof rawSoft.autoCoupleWithBmi === 'boolean' ? rawSoft.autoCoupleWithBmi : true,
    faceSoftnessBias: sanitizeFiniteNumber(rawSoft.faceSoftnessBias, 0, -0.5, 0.8, 2),
    neckThicknessBias: sanitizeFiniteNumber(rawSoft.neckThicknessBias, 0, -0.4, 0.6, 2),
    torsoSoftnessBias: sanitizeFiniteNumber(rawSoft.torsoSoftnessBias, 0, -0.5, 0.8, 2),
    limbSoftnessBias: sanitizeFiniteNumber(rawSoft.limbSoftnessBias, 0, -0.5, 0.8, 2),
    extremityPlumpnessBias: sanitizeFiniteNumber(
      rawSoft.extremityPlumpnessBias,
      0,
      -0.4,
      0.7,
      2
    ),
  };

  const rawApp =
    obj.appearance && typeof obj.appearance === 'object'
      ? (obj.appearance as Record<string, unknown>)
      : {};

  const explicitHex =
    typeof rawApp.skinToneHex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(rawApp.skinToneHex.trim())
      ? sanitizeHexColor(rawApp.skinToneHex, base.appearance.skinToneHex)
      : null;

  const hasExplicitMst = isMstLevel(rawApp.mstLevel) || typeof rawApp.mstUndertone === 'string';
  const fallbackMst = explicitHex
    ? findClosestMstFromHex(explicitHex)
    : getMstSwatch(base.appearance.mstLevel, base.appearance.mstUndertone);

  const mstLevel = hasExplicitMst
    ? normalizeMstLevel(rawApp.mstLevel, fallbackMst.level)
    : fallbackMst.level;
  const mstUndertone = hasExplicitMst
    ? normalizeMstUndertone(rawApp.mstUndertone, fallbackMst.undertone)
    : fallbackMst.undertone;
  const resolvedSwatch = getMstSwatch(mstLevel, mstUndertone);

  const skinToneHex = explicitHex || resolvedSwatch.hex;
  const personalColor =
    typeof rawApp.personalColor === 'string' && rawApp.personalColor.trim()
      ? normalizeSeasonKey(rawApp.personalColor)
      : resolvedSwatch.personalColor;

  const appearance: AvatarAppearance = {
    mstLevel,
    mstUndertone,
    skinToneHex,
    personalColor,
    headShape: normalizeHeadShape(rawApp.headShape, 'oval'),
    eyeShape: normalizeEyeShape(rawApp.eyeShape, 'almond'),
    eyeSizeScale: sanitizeFiniteNumber(rawApp.eyeSizeScale, 1, 0.8, 1.25, 2),
    noseWidthScale: sanitizeFiniteNumber(rawApp.noseWidthScale, 1, 0.8, 1.25, 2),
    lipFullnessScale: sanitizeFiniteNumber(rawApp.lipFullnessScale, 1, 0.75, 1.35, 2),
    browStrength: sanitizeFiniteNumber(rawApp.browStrength, 1, 0.6, 1.4, 2),
    hairStyle: normalizeHairStyle(rawApp.hairStyle, base.appearance.hairStyle),
    hairColorHex: sanitizeHexColor(rawApp.hairColorHex, '#2B211B'),
    facialHair: normalizeFacialHair(rawApp.facialHair, 'none'),
    facePhotoUrl: sanitizePhotoUrl(rawApp.facePhotoUrl),
  };

  return {
    version: 2,
    framePreset,
    archetypePreset,
    anthropometrics,
    coupledSoftTissue,
    appearance,
  };
}

function fingerprintFacePhoto(url: string | null | undefined): string {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s) return 'none';
  const len = s.length;
  if (len <= 160) return s;
  const q1 = Math.floor(len * 0.25);
  const mid = Math.floor(len * 0.5);
  const q3 = Math.floor(len * 0.75);
  return [
    `len:${len}`,
    s.slice(0, 40),
    s.slice(Math.max(0, q1 - 16), q1 + 16),
    s.slice(Math.max(0, mid - 16), mid + 16),
    s.slice(Math.max(0, q3 - 16), q3 + 16),
    s.slice(-40),
  ].join('|');
}

function mix32(h: number): number {
  let x = h >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Deterministic, fast synchronous 16-char hex digest (`av2_<16-hex>`) over canonicalized `AvatarSpec` fields.
 */
export function computeAvatarConfigHash(spec: AvatarSpec): string {
  const s = sanitizeAvatarSpec(spec);
  const a = s.anthropometrics;
  const c = s.coupledSoftTissue;
  const p = s.appearance;

  const canonicalPayload = [
    `v:${s.version}`,
    `fr:${s.framePreset}`,
    `ar:${s.archetypePreset}`,
    `h:${a.heightCm}`,
    `w:${a.weightKg}`,
    `sh:${a.shoulderScale.toFixed(2)}`,
    `ch:${a.chestScale.toFixed(2)}`,
    `cf:${a.chestForm}`,
    `wa:${a.waistScale.toFixed(2)}`,
    `ab:${a.abdomenScale.toFixed(2)}`,
    `hi:${a.hipScale.toFixed(2)}`,
    `gl:${a.gluteScale.toFixed(2)}`,
    `am:${a.armMassScale.toFixed(2)}`,
    `lm:${a.legMassScale.toFixed(2)}`,
    `ll:${a.legLengthScale.toFixed(2)}`,
    `md:${a.muscleDefinition.toFixed(2)}`,
    `ac:${c.autoCoupleWithBmi ? 1 : 0}`,
    `fb:${c.faceSoftnessBias.toFixed(2)}`,
    `nb:${c.neckThicknessBias.toFixed(2)}`,
    `tb:${c.torsoSoftnessBias.toFixed(2)}`,
    `lb:${c.limbSoftnessBias.toFixed(2)}`,
    `eb:${c.extremityPlumpnessBias.toFixed(2)}`,
    `ml:${p.mstLevel}`,
    `mu:${p.mstUndertone}`,
    `sk:${p.skinToneHex}`,
    `pc:${p.personalColor}`,
    `hs:${p.headShape}`,
    `es:${p.eyeShape}`,
    `ez:${p.eyeSizeScale.toFixed(2)}`,
    `nw:${p.noseWidthScale.toFixed(2)}`,
    `lf:${p.lipFullnessScale.toFixed(2)}`,
    `bs:${p.browStrength.toFixed(2)}`,
    `hr:${p.hairStyle}`,
    `hc:${p.hairColorHex}`,
    `fh:${p.facialHair}`,
    `fp:${fingerprintFacePhoto(p.facePhotoUrl)}`,
  ].join(';');

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonicalPayload.length; i++) {
    const code = canonicalPayload.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 3)) ^ i, 0x27d4eb2f) >>> 0;
  }

  const out1 = mix32(h1 ^ Math.imul(h2, 0x9e3779b1));
  const out2 = mix32(h2 ^ Math.imul(h1, 0x85ebca77));

  return `av2_${out1.toString(16).padStart(8, '0')}${out2.toString(16).padStart(8, '0')}`;
}

interface FrameBaseline {
  headW: number;
  headH: number;
  cheek: number;
  jawSoft: number;
  neckW: number;
  shoulderW: number;
  shoulderSlope: number;
  ribW: number;
  ribD: number;
  waistW: number;
  pelvisW: number;
  glute: number;
  armR: number;
  wristR: number;
  handW: number;
  thighR: number;
  calfR: number;
  ankleR: number;
  footW: number;
  footLen: number;
}

const FRAME_BASELINES: Readonly<Record<AvatarFramePreset, FrameBaseline>> = {
  feminine: {
    headW: 0.98,
    headH: 0.99,
    cheek: 1.02,
    jawSoft: 0.19,
    neckW: 0.91,
    shoulderW: 0.93,
    shoulderSlope: 0.23,
    ribW: 0.92,
    ribD: 0.94,
    waistW: 0.86,
    pelvisW: 1.05,
    glute: 0.44,
    armR: 0.94,
    wristR: 0.92,
    handW: 0.92,
    thighR: 1.02,
    calfR: 0.97,
    ankleR: 0.93,
    footW: 0.93,
    footLen: 0.95,
  },
  masculine: {
    headW: 1.02,
    headH: 1.01,
    cheek: 0.97,
    jawSoft: 0.13,
    neckW: 1.08,
    shoulderW: 1.11,
    shoulderSlope: 0.17,
    ribW: 1.07,
    ribD: 1.05,
    waistW: 1.01,
    pelvisW: 0.93,
    glute: 0.33,
    armR: 1.07,
    wristR: 1.05,
    handW: 1.06,
    thighR: 1.0,
    calfR: 1.03,
    ankleR: 1.03,
    footW: 1.04,
    footLen: 1.03,
  },
  androgynous: {
    headW: 1.0,
    headH: 1.0,
    cheek: 0.99,
    jawSoft: 0.16,
    neckW: 0.98,
    shoulderW: 1.0,
    shoulderSlope: 0.2,
    ribW: 0.99,
    ribD: 0.99,
    waistW: 0.94,
    pelvisW: 0.99,
    glute: 0.38,
    armR: 1.0,
    wristR: 0.98,
    handW: 0.98,
    thighR: 1.0,
    calfR: 1.0,
    ankleR: 0.98,
    footW: 0.98,
    footLen: 0.99,
  },
  custom: {
    headW: 1.0,
    headH: 1.0,
    cheek: 1.0,
    jawSoft: 0.16,
    neckW: 1.0,
    shoulderW: 1.0,
    shoulderSlope: 0.2,
    ribW: 1.0,
    ribD: 1.0,
    waistW: 0.95,
    pelvisW: 1.0,
    glute: 0.38,
    armR: 1.0,
    wristR: 1.0,
    handW: 1.0,
    thighR: 1.0,
    calfR: 1.0,
    ankleR: 1.0,
    footW: 1.0,
    footLen: 1.0,
  },
};

interface ArchetypeOffsets {
  shoulderMul: number;
  ribMul: number;
  waistMul: number;
  abdomenAdd: number;
  pelvisMul: number;
  gluteMul: number;
  armMul: number;
  thighMul: number;
  calfMul: number;
  softBonus: number;
}

const ARCHETYPE_OFFSETS: Readonly<Record<AvatarArchetypePreset, ArchetypeOffsets>> = {
  hourglass: {
    shoulderMul: 1.02,
    ribMul: 0.99,
    waistMul: 0.87,
    abdomenAdd: 0.0,
    pelvisMul: 1.07,
    gluteMul: 1.12,
    armMul: 0.99,
    thighMul: 1.04,
    calfMul: 1.0,
    softBonus: 0.02,
  },
  inverted_triangle: {
    shoulderMul: 1.09,
    ribMul: 1.06,
    waistMul: 0.95,
    abdomenAdd: -0.02,
    pelvisMul: 0.93,
    gluteMul: 0.94,
    armMul: 1.05,
    thighMul: 0.96,
    calfMul: 0.98,
    softBonus: -0.02,
  },
  pear: {
    shoulderMul: 0.94,
    ribMul: 0.95,
    waistMul: 0.94,
    abdomenAdd: 0.04,
    pelvisMul: 1.12,
    gluteMul: 1.18,
    armMul: 0.96,
    thighMul: 1.11,
    calfMul: 1.05,
    softBonus: 0.03,
  },
  apple: {
    shoulderMul: 1.02,
    ribMul: 1.08,
    waistMul: 1.15,
    abdomenAdd: 0.24,
    pelvisMul: 1.01,
    gluteMul: 1.0,
    armMul: 1.04,
    thighMul: 1.01,
    calfMul: 0.99,
    softBonus: 0.08,
  },
  rectangle: {
    shoulderMul: 1.0,
    ribMul: 1.0,
    waistMul: 1.02,
    abdomenAdd: 0.0,
    pelvisMul: 0.99,
    gluteMul: 0.96,
    armMul: 1.0,
    thighMul: 0.99,
    calfMul: 1.0,
    softBonus: 0.0,
  },
  athletic: {
    shoulderMul: 1.07,
    ribMul: 1.05,
    waistMul: 0.92,
    abdomenAdd: -0.04,
    pelvisMul: 0.98,
    gluteMul: 1.08,
    armMul: 1.11,
    thighMul: 1.08,
    calfMul: 1.07,
    softBonus: -0.05,
  },
  petite: {
    shoulderMul: 0.93,
    ribMul: 0.93,
    waistMul: 0.9,
    abdomenAdd: -0.03,
    pelvisMul: 0.94,
    gluteMul: 0.92,
    armMul: 0.91,
    thighMul: 0.92,
    calfMul: 0.93,
    softBonus: -0.06,
  },
  plus_size: {
    shoulderMul: 1.04,
    ribMul: 1.09,
    waistMul: 1.17,
    abdomenAdd: 0.22,
    pelvisMul: 1.12,
    gluteMul: 1.2,
    armMul: 1.12,
    thighMul: 1.14,
    calfMul: 1.09,
    softBonus: 0.14,
  },
};

const HEAD_SHAPE_MODS: Readonly<
  Record<AvatarHeadShape, { widthMul: number; heightMul: number; jawDelta: number }>
> = {
  oval: { widthMul: 1.0, heightMul: 1.0, jawDelta: 0.0 },
  round: { widthMul: 1.05, heightMul: 0.96, jawDelta: 0.08 },
  square: { widthMul: 1.04, heightMul: 0.99, jawDelta: -0.05 },
  heart: { widthMul: 1.01, heightMul: 0.99, jawDelta: -0.03 },
  long: { widthMul: 0.95, heightMul: 1.06, jawDelta: -0.02 },
};

const CHEST_FORM_PROJECTION: Readonly<
  Record<ChestContourForm, { proj: number; widthMul: number }>
> = {
  flat: { proj: 0.14, widthMul: 1.0 },
  pectoral: { proj: 0.26, widthMul: 1.02 },
  contoured: { proj: 0.46, widthMul: 1.04 },
  full_bust: { proj: 0.72, widthMul: 1.09 },
};

/**
 * Computes continuous BMI soft-tissue index:
 * - `0` at `BMI = 21.2`
 * - `-0.32` at `BMI = 15.0`
 * - `~1.05` at `164cm / 103kg` (`BMI = 38.3`)
 * - `+1.35` at `BMI = 42.0`
 */
export function computeBmiSoftIndex(bmi: number): number {
  if (!Number.isFinite(bmi)) return 0;
  if (bmi < 21.2) {
    const t = clamp((21.2 - bmi) / (21.2 - 15.0), 0, 1.12);
    return roundTo(-0.32 * t, 4);
  }
  const normalizedHigh = Math.max(0, (bmi - 21.2) / (42.0 - 21.2));
  const curved = Math.pow(Math.min(normalizedHigh, 1.25), 1.26) * 1.35;
  return roundTo(clamp(curved, 0, 1.5), 4);
}

/**
 * Resolves full-body coupled soft-tissue & skeletal multipliers across all anatomical zones.
 */
export function resolveCoupledBodyMetrics(spec: AvatarSpec): CoupledBodyMetrics {
  const s = sanitizeAvatarSpec(spec);
  const anthro = s.anthropometrics;
  const soft = s.coupledSoftTissue;
  const app = s.appearance;

  const heightM = anthro.heightCm / 100;
  const bmi = roundTo(anthro.weightKg / Math.max(0.5, heightM * heightM), 2);
  const bmiSoftIndex = computeBmiSoftIndex(bmi);
  const coupledS = soft.autoCoupleWithBmi ? bmiSoftIndex : 0;
  const posS = Math.max(0, coupledS);
  const negS = Math.min(0, coupledS);

  const frame = FRAME_BASELINES[s.framePreset];
  const arch = ARCHETYPE_OFFSETS[s.archetypePreset];
  const headMod = HEAD_SHAPE_MODS[app.headShape];
  const chestMod = CHEST_FORM_PROJECTION[anthro.chestForm];
  const muscle = anthro.muscleDefinition;

  const heightScale = roundTo(anthro.heightCm / 170, 4);

  // 1. Head & Neck (coupled cheek pads, jawline softening, submental under-jaw fullness, and neck circumference)
  const faceS = coupledS + arch.softBonus * 0.5 + soft.faceSoftnessBias;
  const headWidth = roundTo(
    frame.headW * headMod.widthMul * clamp(1 + 0.12 * posS + 0.04 * negS + soft.faceSoftnessBias * 0.08, 0.88, 1.28),
    4
  );
  const headHeight = roundTo(
    frame.headH * headMod.heightMul * clamp(1 + 0.035 * posS, 0.9, 1.14),
    4
  );
  const cheekFullness = roundTo(
    clamp(frame.cheek + 0.36 * coupledS + arch.softBonus * 0.35 + soft.faceSoftnessBias * 0.32, 0.76, 1.72),
    4
  );
  const jawSoftness = roundTo(
    clamp(frame.jawSoft + headMod.jawDelta + 0.61 * faceS - (muscle - 0.3) * 0.08, 0.03, 1.0),
    4
  );
  const submentalFullness = roundTo(
    clamp(0.09 + 0.66 * coupledS + arch.softBonus * 0.4 + soft.faceSoftnessBias * 0.38, 0.01, 1.0),
    4
  );

  const neckMuscleBoost = 1 + (muscle - 0.3) * 0.08;
  const neckWidth = roundTo(
    frame.neckW *
      neckMuscleBoost *
      clamp(1 + 0.27 * coupledS + arch.softBonus * 0.22 + soft.neckThicknessBias * 0.26, 0.78, 1.62),
    4
  );
  const neckDepth = roundTo(
    neckWidth * clamp(1 + 0.07 * posS + soft.neckThicknessBias * 0.08, 0.85, 1.3),
    4
  );

  // 2. Torso (shoulders, ribcage, chest contour, waist, prominent forward abdomen projection, pelvis, glutes)
  const shoulderMuscleBoost = 1 + (muscle - 0.3) * 0.09;
  const shoulderHalfWidth = roundTo(
    frame.shoulderW *
      arch.shoulderMul *
      anthro.shoulderScale *
      shoulderMuscleBoost *
      clamp(1 + 0.14 * coupledS, 0.84, 1.38),
    4
  );
  const shoulderSlope = roundTo(
    clamp(frame.shoulderSlope - (muscle - 0.3) * 0.04 + 0.035 * posS, 0.08, 0.34),
    4
  );

  const ribcageWidth = roundTo(
    frame.ribW *
      arch.ribMul *
      (0.45 + 0.55 * anthro.chestScale) *
      clamp(1 + 0.19 * coupledS + soft.torsoSoftnessBias * 0.14, 0.82, 1.48),
    4
  );
  const ribcageDepth = roundTo(
    frame.ribD *
      (0.5 + 0.5 * anthro.chestScale) *
      clamp(1 + 0.22 * coupledS + soft.torsoSoftnessBias * 0.16, 0.82, 1.52),
    4
  );

  const chestForm = anthro.chestForm;
  const chestProjection = roundTo(
    clamp(
      chestMod.proj * anthro.chestScale +
        0.26 * posS +
        (chestForm === 'pectoral' ? (muscle - 0.3) * 0.12 : 0) +
        soft.torsoSoftnessBias * 0.12,
      0.06,
      1.35
    ),
    4
  );
  const bustWidth = roundTo(
    ribcageWidth *
      chestMod.widthMul *
      (0.65 + 0.35 * anthro.chestScale) *
      clamp(1 + 0.07 * posS, 0.9, 1.28),
    4
  );

  const waistHalfWidth = roundTo(
    frame.waistW *
      arch.waistMul *
      anthro.waistScale *
      clamp(1 + 0.38 * coupledS + soft.torsoSoftnessBias * 0.26 - (muscle - 0.3) * 0.05, 0.72, 1.82),
    4
  );
  const waistDepth = roundTo(
    waistHalfWidth * clamp(0.82 + 0.29 * posS + arch.abdomenAdd * 0.35, 0.72, 1.48),
    4
  );
  const abdomenProjection = roundTo(
    clamp(
      (0.11 + Math.max(0, arch.abdomenAdd)) * anthro.abdomenScale +
        0.64 * posS +
        0.12 * negS +
        arch.abdomenAdd * 0.45 +
        soft.torsoSoftnessBias * 0.3 -
        (muscle - 0.3) * 0.07,
      0.02,
      1.45
    ),
    4
  );

  const pelvisHalfWidth = roundTo(
    frame.pelvisW *
      arch.pelvisMul *
      anthro.hipScale *
      clamp(1 + 0.27 * coupledS + soft.torsoSoftnessBias * 0.16, 0.8, 1.65),
    4
  );
  const hipDepth = roundTo(
    pelvisHalfWidth * clamp(0.88 + 0.24 * posS, 0.8, 1.42),
    4
  );
  const gluteProjection = roundTo(
    clamp(
      frame.glute * arch.gluteMul * anthro.gluteScale +
        0.34 * posS +
        (muscle - 0.3) * 0.09 +
        soft.limbSoftnessBias * 0.14,
      0.14,
      1.35
    ),
    4
  );

  // 3. Upper Limbs & Hands (coupled upper arm, forearm, wrist, dorsal hand pad, and finger plumpness)
  const armMuscleBoost = 1 + (muscle - 0.3) * 0.14;
  const upperArmRadius = roundTo(
    frame.armR *
      arch.armMul *
      anthro.armMassScale *
      armMuscleBoost *
      clamp(1 + 0.37 * coupledS + soft.limbSoftnessBias * 0.26, 0.74, 1.85),
    4
  );
  const forearmRadius = roundTo(
    frame.armR *
      (0.4 + 0.6 * anthro.armMassScale) *
      (1 + (muscle - 0.3) * 0.1) *
      clamp(1 + 0.28 * coupledS + soft.limbSoftnessBias * 0.2, 0.78, 1.65),
    4
  );
  const wristRadius = roundTo(
    frame.wristR *
      clamp(1 + 0.22 * coupledS + soft.extremityPlumpnessBias * 0.22, 0.82, 1.52),
    4
  );
  const handWidth = roundTo(
    frame.handW *
      clamp(1 + 0.21 * coupledS + soft.extremityPlumpnessBias * 0.2, 0.84, 1.48),
    4
  );
  const handThickness = roundTo(
    frame.handW *
      clamp(1 + 0.25 * coupledS + soft.extremityPlumpnessBias * 0.24, 0.82, 1.56),
    4
  );
  const fingerThickness = roundTo(
    frame.wristR *
      clamp(1 + 0.23 * coupledS + soft.extremityPlumpnessBias * 0.24, 0.82, 1.54),
    4
  );

  // 4. Lower Limbs & Feet (coupled thigh, knee, calf, ankle, foot width, and dorsal instep height)
  const legMuscleBoost = 1 + (muscle - 0.3) * 0.13;
  const thighRadius = roundTo(
    frame.thighR *
      arch.thighMul *
      anthro.legMassScale *
      legMuscleBoost *
      clamp(1 + 0.36 * coupledS + soft.limbSoftnessBias * 0.26, 0.75, 1.85),
    4
  );
  const kneeRadius = roundTo(
    ((frame.thighR + frame.calfR) * 0.5) *
      clamp(1 + 0.24 * coupledS + soft.limbSoftnessBias * 0.18, 0.82, 1.56),
    4
  );
  const calfRadius = roundTo(
    frame.calfR *
      arch.calfMul *
      anthro.legMassScale *
      (1 + (muscle - 0.3) * 0.12) *
      clamp(1 + 0.29 * coupledS + soft.limbSoftnessBias * 0.22, 0.78, 1.72),
    4
  );
  const ankleRadius = roundTo(
    frame.ankleR *
      clamp(1 + 0.22 * coupledS + soft.extremityPlumpnessBias * 0.22, 0.82, 1.52),
    4
  );
  const footWidth = roundTo(
    frame.footW *
      clamp(1 + 0.2 * coupledS + soft.extremityPlumpnessBias * 0.2, 0.84, 1.46),
    4
  );
  const footLength = roundTo(
    heightScale * frame.footLen * clamp(1 + 0.03 * posS, 0.94, 1.1),
    4
  );
  const instepHeight = roundTo(
    frame.footW *
      clamp(1 + 0.22 * coupledS + soft.extremityPlumpnessBias * 0.22, 0.84, 1.52),
    4
  );

  return {
    bmi,
    bmiSoftIndex,
    heightScale,
    headWidth,
    headHeight,
    cheekFullness,
    jawSoftness,
    submentalFullness,
    neckWidth,
    neckDepth,
    shoulderHalfWidth,
    shoulderSlope,
    ribcageWidth,
    ribcageDepth,
    chestForm,
    chestProjection,
    bustWidth,
    waistHalfWidth,
    waistDepth,
    abdomenProjection,
    pelvisHalfWidth,
    hipDepth,
    gluteProjection,
    upperArmRadius,
    forearmRadius,
    wristRadius,
    handWidth,
    handThickness,
    fingerThickness,
    thighRadius,
    kneeRadius,
    calfRadius,
    ankleRadius,
    footWidth,
    footLength,
    instepHeight,
  };
}

/**
 * Maps an `AvatarSpec` back into a legacy `BodyMorphSpec` for backward-compatible consumers.
 */
export function avatarSpecToLegacyBodySpec(
  spec: AvatarSpec,
  fallbackGender: 'male' | 'female' = 'male'
): BodyMorphSpec {
  const s = sanitizeAvatarSpec(spec);
  const archMeta = AVATAR_ARCHETYPE_OPTIONS.find((item) => item.key === s.archetypePreset);
  const legacyBodyShape: BodyShapeKey = archMeta ? archMeta.legacyBodyShape : 'standard_balanced';

  const gender: 'male' | 'female' =
    s.framePreset === 'feminine'
      ? 'female'
      : s.framePreset === 'masculine'
        ? 'male'
        : fallbackGender === 'female'
          ? 'female'
          : 'male';

  return sanitizeBodySpec({
    gender,
    heightCm: s.anthropometrics.heightCm,
    weightKg: s.anthropometrics.weightKg,
    bodyShape: legacyBodyShape,
    shoulderScale: s.anthropometrics.shoulderScale,
    waistScale: s.anthropometrics.waistScale,
    hipScale: s.anthropometrics.hipScale,
  });
}

// ============================================================================
// React 19 External Store (`useSyncExternalStore`) + Legacy Prop Bridge
// ============================================================================

interface LegacyBaselineRecord {
  skinToneHex: string;
  personalColor: PersonalColorSeasonKey;
  heightCm: number;
  weightKg: number;
  bodyShape: BodyShapeKey;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
}

const storeListeners = new Set<() => void>();
let cachedSnapshot: AvatarSpecSnapshot | null = null;
let hasPersistedV2Spec = false;
let legacyBaselineAtV2Commit: LegacyBaselineRecord | null = null;
let storageEventBound = false;

function captureCurrentLegacyStorageBaseline(): LegacyBaselineRecord {
  const skin = getStoredSkinProfile();
  const body = getStoredBodySpec();
  return {
    skinToneHex: skin.skinToneHex,
    personalColor: skin.personalColor,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    bodyShape: body.bodyShape,
    shoulderScale: body.shoulderScale,
    waistScale: body.waistScale,
    hipScale: body.hipScale,
  };
}

function createInitialSpecFromStorage(): AvatarSpec {
  if (typeof localStorage !== 'undefined') {
    try {
      const rawV2 = localStorage.getItem(AVATAR_SPEC_STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2) as unknown;
        hasPersistedV2Spec = true;
        legacyBaselineAtV2Commit = captureCurrentLegacyStorageBaseline();
        return sanitizeAvatarSpec(parsed);
      }
    } catch {
      // Ignore malformed JSON or storage errors
    }
  }

  hasPersistedV2Spec = false;
  legacyBaselineAtV2Commit = null;

  const storedSkin = getStoredSkinProfile();
  const storedBody = getStoredBodySpec();
  const initialFrame: AvatarFramePreset =
    storedBody.gender === 'female' ? 'feminine' : 'androgynous';
  const mst = findClosestMstFromHex(storedSkin.skinToneHex);

  return sanitizeAvatarSpec({
    version: 2,
    framePreset: initialFrame,
    archetypePreset: normalizeArchetypePreset(
      storedBody.bodyShape,
      defaultArchetypeForFrame(initialFrame)
    ),
    anthropometrics: {
      heightCm: storedBody.heightCm,
      weightKg: storedBody.weightKg,
      shoulderScale: storedBody.shoulderScale,
      waistScale: storedBody.waistScale,
      hipScale: storedBody.hipScale,
      chestForm: defaultChestFormForFrame(initialFrame),
    },
    appearance: {
      mstLevel: storedSkin.mstLevel ?? mst.level,
      mstUndertone: storedSkin.mstUndertone ?? mst.undertone,
      skinToneHex: storedSkin.skinToneHex,
      personalColor: storedSkin.personalColor,
    },
  });
}

function ensureSnapshotInitialized(): AvatarSpecSnapshot {
  if (!cachedSnapshot) {
    const spec = createInitialSpecFromStorage();
    cachedSnapshot = {
      spec,
      avatarConfigHash: computeAvatarConfigHash(spec),
    };
  }
  return cachedSnapshot;
}

function persistAndPublishSpec(nextCleanSpec: AvatarSpec): AvatarSpec {
  const nextHash = computeAvatarConfigHash(nextCleanSpec);
  hasPersistedV2Spec = true;
  legacyBaselineAtV2Commit = captureCurrentLegacyStorageBaseline();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AVATAR_SPEC_STORAGE_KEY, JSON.stringify(nextCleanSpec));
    } catch {
      // Ignore quota errors
    }
  }

  if (cachedSnapshot && cachedSnapshot.avatarConfigHash === nextHash) {
    cachedSnapshot = {
      spec: nextCleanSpec,
      avatarConfigHash: nextHash,
    };
  } else {
    cachedSnapshot = {
      spec: nextCleanSpec,
      avatarConfigHash: nextHash,
    };
  }

  for (const listener of storeListeners) {
    listener();
  }
  return nextCleanSpec;
}

function bindCrossTabStorageListener(): void {
  if (storageEventBound || typeof window === 'undefined') return;
  storageEventBound = true;
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== AVATAR_SPEC_STORAGE_KEY) return;
    try {
      if (event.newValue) {
        const parsed = sanitizeAvatarSpec(JSON.parse(event.newValue) as unknown);
        const hash = computeAvatarConfigHash(parsed);
        hasPersistedV2Spec = true;
        legacyBaselineAtV2Commit = captureCurrentLegacyStorageBaseline();
        if (!cachedSnapshot || cachedSnapshot.avatarConfigHash !== hash) {
          cachedSnapshot = { spec: parsed, avatarConfigHash: hash };
          for (const listener of storeListeners) {
            listener();
          }
        }
      }
    } catch {
      // Ignore cross-tab parse errors
    }
  });
}

/**
 * Returns a referentially stable `{ spec, avatarConfigHash }` snapshot for React 19 `useSyncExternalStore`.
 */
export function getAvatarSpecSnapshot(): AvatarSpecSnapshot {
  return ensureSnapshotInitialized();
}

export function subscribeAvatarSpec(listener: () => void): () => void {
  bindCrossTabStorageListener();
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

export function setAvatarSpec(
  nextOrUpdater: AvatarSpec | ((prev: AvatarSpec) => AvatarSpec)
): AvatarSpec {
  const prev = ensureSnapshotInitialized().spec;
  const rawNext = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
  return persistAndPublishSpec(sanitizeAvatarSpec(rawNext));
}

function mergeAvatarSpecPatch(prev: AvatarSpec, patch: AvatarSpecPatch): AvatarSpec {
  const nextFrame = patch.framePreset
    ? normalizeFramePreset(patch.framePreset, prev.framePreset)
    : prev.framePreset;
  const nextArchetype = patch.archetypePreset
    ? normalizeArchetypePreset(patch.archetypePreset, prev.archetypePreset)
    : prev.archetypePreset;

  const mergedAnthro = {
    ...prev.anthropometrics,
    ...(patch.anthropometrics || {}),
  };

  const mergedSoft = {
    ...prev.coupledSoftTissue,
    ...(patch.coupledSoftTissue || {}),
  };

  const patchApp = patch.appearance || {};
  const mergedApp: Record<string, unknown> = {
    ...prev.appearance,
    ...patchApp,
  };

  // Bidirectional MST <-> Hex sync when only one side was patched
  const patchedMst =
    patchApp.mstLevel !== undefined || patchApp.mstUndertone !== undefined;
  const patchedHex =
    typeof patchApp.skinToneHex === 'string' && patchApp.skinToneHex.trim().length > 0;

  if (patchedMst && !patchedHex) {
    const lvl = normalizeMstLevel(patchApp.mstLevel ?? prev.appearance.mstLevel, prev.appearance.mstLevel);
    const ut = normalizeMstUndertone(
      patchApp.mstUndertone ?? prev.appearance.mstUndertone,
      prev.appearance.mstUndertone
    );
    const swatch = getMstSwatch(lvl, ut);
    mergedApp.mstLevel = swatch.level;
    mergedApp.mstUndertone = swatch.undertone;
    mergedApp.skinToneHex = swatch.hex;
    if (patchApp.personalColor === undefined) {
      mergedApp.personalColor = swatch.personalColor;
    }
  } else if (patchedHex && !patchedMst) {
    const hex = sanitizeHexColor(patchApp.skinToneHex, prev.appearance.skinToneHex);
    const closest = findClosestMstFromHex(hex);
    mergedApp.skinToneHex = hex;
    mergedApp.mstLevel = closest.level;
    mergedApp.mstUndertone = closest.undertone;
    if (patchApp.personalColor === undefined) {
      mergedApp.personalColor = closest.personalColor;
    }
  }

  return sanitizeAvatarSpec({
    version: 2,
    framePreset: nextFrame,
    archetypePreset: nextArchetype,
    anthropometrics: mergedAnthro,
    coupledSoftTissue: mergedSoft,
    appearance: mergedApp,
  });
}

export function patchAvatarSpec(
  patchOrUpdater: AvatarSpecPatch | ((prev: AvatarSpec) => AvatarSpec | AvatarSpecPatch)
): AvatarSpec {
  const prev = ensureSnapshotInitialized().spec;
  const resolved = typeof patchOrUpdater === 'function' ? patchOrUpdater(prev) : patchOrUpdater;
  if ('version' in resolved && resolved.version === 2) {
    return persistAndPublishSpec(sanitizeAvatarSpec(resolved));
  }
  return persistAndPublishSpec(mergeAvatarSpecPatch(prev, resolved as AvatarSpecPatch));
}

export function applyFramePreset(
  framePreset: AvatarFramePreset,
  options: { resetSliders?: boolean } = {}
): AvatarSpec {
  const prev = ensureSnapshotInitialized().spec;
  const safeFrame = normalizeFramePreset(framePreset, prev.framePreset);
  const reset = Boolean(options.resetSliders);

  return persistAndPublishSpec(
    sanitizeAvatarSpec({
      ...prev,
      framePreset: safeFrame,
      anthropometrics: {
        ...prev.anthropometrics,
        chestForm:
          safeFrame === 'custom'
            ? prev.anthropometrics.chestForm
            : defaultChestFormForFrame(safeFrame),
        ...(reset
          ? {
              shoulderScale: 1,
              chestScale: 1,
              waistScale: 1,
              abdomenScale: 1,
              hipScale: 1,
              gluteScale: 1,
              armMassScale: 1,
              legMassScale: 1,
              legLengthScale: 1,
            }
          : {}),
      },
      appearance: {
        ...prev.appearance,
        facialHair: safeFrame === 'feminine' ? 'none' : prev.appearance.facialHair,
      },
    })
  );
}

export function applyArchetypePreset(
  archetypePreset: AvatarArchetypePreset,
  options: { keepSliders?: boolean } = {}
): AvatarSpec {
  const prev = ensureSnapshotInitialized().spec;
  const safeArch = normalizeArchetypePreset(archetypePreset, prev.archetypePreset);
  const keepSliders = Boolean(options.keepSliders);

  let nextChestForm = prev.anthropometrics.chestForm;
  if (prev.framePreset === 'feminine' && safeArch === 'plus_size') {
    nextChestForm = 'full_bust';
  } else if (prev.framePreset === 'feminine' && nextChestForm === 'flat') {
    nextChestForm = 'contoured';
  }

  return persistAndPublishSpec(
    sanitizeAvatarSpec({
      ...prev,
      archetypePreset: safeArch,
      anthropometrics: {
        ...prev.anthropometrics,
        chestForm: nextChestForm,
        ...(keepSliders
          ? {}
          : {
              shoulderScale: 1,
              chestScale: 1,
              waistScale: 1,
              abdomenScale: 1,
              hipScale: 1,
              gluteScale: 1,
              armMassScale: 1,
              legMassScale: 1,
            }),
      },
    })
  );
}

export function resetAvatarSpec(framePreset: AvatarFramePreset = 'androgynous'): AvatarSpec {
  return persistAndPublishSpec(getDefaultAvatarSpec(framePreset));
}

export interface UseAvatarSpecReturn {
  spec: AvatarSpec;
  avatarConfigHash: string;
  setAvatarSpec: typeof setAvatarSpec;
  patchAvatarSpec: typeof patchAvatarSpec;
  applyFramePreset: typeof applyFramePreset;
  applyArchetypePreset: typeof applyArchetypePreset;
  resetAvatarSpec: typeof resetAvatarSpec;
}

/**
 * React 19 hook backed by `useSyncExternalStore` for zero-tearing reactive `AvatarSpec` access.
 */
export function useAvatarSpec(): UseAvatarSpecReturn {
  const snapshot = useSyncExternalStore(
    subscribeAvatarSpec,
    getAvatarSpecSnapshot,
    getAvatarSpecSnapshot
  );

  return {
    spec: snapshot.spec,
    avatarConfigHash: snapshot.avatarConfigHash,
    setAvatarSpec,
    patchAvatarSpec,
    applyFramePreset,
    applyArchetypePreset,
    resetAvatarSpec,
  };
}

/**
 * Bridges legacy `App.jsx` / E2E props (`skinProfile`, `bodySpec`, `user`, `personReferenceUrl`)
 * with the stored `AvatarSpec` so both V2 Avatar Studio controls AND legacy actions
 * (signup `165cm / 53kg`, quick skin swatch `#8E5C40`, `#apply-body-spec-btn` `muscular`)
 * reflect 100% accurately.
 */
export function bridgeLegacyPropsToAvatarSpec(
  input?: LegacyAvatarBridgeInput | null
): AvatarSpecSnapshot {
  const baseSnapshot = ensureSnapshotInitialized();
  if (!input || typeof input !== 'object') {
    return baseSnapshot;
  }

  const stored = baseSnapshot.spec;
  const baseline = legacyBaselineAtV2Commit;
  const { skinProfile, bodySpec, user, personReferenceUrl } = input;
  const realUser = user && !user.isSampleDemo ? user : null;

  // 1. Frame resolution: preserve explicit V2 frame unless no V2 spec was saved yet
  let framePreset = stored.framePreset;
  if (!hasPersistedV2Spec) {
    const genderHint = realUser?.gender || bodySpec?.gender || skinProfile?.gender;
    if (genderHint === 'female') {
      framePreset = 'feminine';
    } else if (genderHint === 'male' && realUser) {
      framePreset = 'masculine';
    }
  }

  // 2. Skin tone & MST resolution
  const rawPropHex = skinProfile?.skinToneHex || realUser?.skinToneHex || null;
  const propHex = rawPropHex ? sanitizeHexColor(rawPropHex, '') : '';
  const propHexChangedFromBaseline =
    Boolean(propHex) && (!baseline || propHex !== baseline.skinToneHex);

  let skinToneHex = stored.appearance.skinToneHex;
  let mstLevel = stored.appearance.mstLevel;
  let mstUndertone = stored.appearance.mstUndertone;
  let personalColor = stored.appearance.personalColor;

  if (propHexChangedFromBaseline && propHex) {
    skinToneHex = propHex;
    const explicitMstLevel = isMstLevel(skinProfile?.mstLevel) ? skinProfile.mstLevel : null;
    const explicitMstUt = skinProfile?.mstUndertone
      ? normalizeMstUndertone(skinProfile.mstUndertone, mstUndertone)
      : null;
    if (explicitMstLevel && explicitMstUt) {
      mstLevel = explicitMstLevel;
      mstUndertone = explicitMstUt;
    } else {
      const closest = findClosestMstFromHex(propHex);
      mstLevel = closest.level;
      mstUndertone = closest.undertone;
    }
  }

  const rawPropSeason = skinProfile?.personalColor || realUser?.personalColor || null;
  if (rawPropSeason) {
    const normalizedPropSeason = normalizeSeasonKey(rawPropSeason);
    if (!baseline || normalizedPropSeason !== baseline.personalColor || propHexChangedFromBaseline) {
      personalColor = normalizedPropSeason;
    }
  }

  // 3. Height & Weight resolution
  const propHeightRaw = bodySpec?.heightCm ?? realUser?.heightCm;
  const propHeight =
    propHeightRaw !== null && propHeightRaw !== undefined && Number.isFinite(Number(propHeightRaw))
      ? clamp(Math.round(Number(propHeightRaw)), 140, 205)
      : null;
  const heightCm =
    propHeight !== null && (!baseline || propHeight !== baseline.heightCm)
      ? propHeight
      : stored.anthropometrics.heightCm;

  const propWeightRaw = bodySpec?.weightKg ?? realUser?.weightKg;
  const propWeight =
    propWeightRaw !== null && propWeightRaw !== undefined && Number.isFinite(Number(propWeightRaw))
      ? clamp(Math.round(Number(propWeightRaw)), 35, 160)
      : null;
  const weightKg =
    propWeight !== null && (!baseline || propWeight !== baseline.weightKg)
      ? propWeight
      : stored.anthropometrics.weightKg;

  // 4. Archetype / Legacy BodyShape resolution (preserve many-to-one V2 archetypes when compatible)
  let archetypePreset = stored.archetypePreset;
  const rawPropShape = bodySpec?.bodyShape || realUser?.bodyShape || null;
  if (rawPropShape) {
    const propLegacyShape = normalizeBodyShape(rawPropShape);
    const currentArchMeta = AVATAR_ARCHETYPE_OPTIONS.find((o) => o.key === archetypePreset);
    const currentLegacyShape = currentArchMeta?.legacyBodyShape ?? 'standard_balanced';
    const shapeChangedFromBaseline = !baseline || propLegacyShape !== baseline.bodyShape;

    if (shapeChangedFromBaseline && propLegacyShape !== currentLegacyShape) {
      archetypePreset = normalizeArchetypePreset(propLegacyShape, archetypePreset);
    }
  }

  // 5. Scale sliders resolution
  const propShoulder =
    bodySpec?.shoulderScale !== undefined && Number.isFinite(Number(bodySpec.shoulderScale))
      ? roundTo(clamp(Number(bodySpec.shoulderScale), 0.75, 1.35), 2)
      : null;
  const shoulderScale =
    propShoulder !== null && (!baseline || propShoulder !== baseline.shoulderScale)
      ? propShoulder
      : stored.anthropometrics.shoulderScale;

  const propWaist =
    bodySpec?.waistScale !== undefined && Number.isFinite(Number(bodySpec.waistScale))
      ? roundTo(clamp(Number(bodySpec.waistScale), 0.7, 1.35), 2)
      : null;
  const waistScale =
    propWaist !== null && (!baseline || propWaist !== baseline.waistScale)
      ? propWaist
      : stored.anthropometrics.waistScale;

  const propHip =
    bodySpec?.hipScale !== undefined && Number.isFinite(Number(bodySpec.hipScale))
      ? roundTo(clamp(Number(bodySpec.hipScale), 0.8, 1.38), 2)
      : null;
  const hipScale =
    propHip !== null && (!baseline || propHip !== baseline.hipScale)
      ? propHip
      : stored.anthropometrics.hipScale;

  // 6. Face photo URL resolution
  const candidatePhoto =
    sanitizePhotoUrl(personReferenceUrl) ||
    sanitizePhotoUrl(skinProfile?.portraitDataUrl) ||
    sanitizePhotoUrl(skinProfile?.previewDataUrl) ||
    sanitizePhotoUrl(skinProfile?.photoUrl) ||
    sanitizePhotoUrl(user?.portraitUrl) ||
    sanitizePhotoUrl(user?.faceImageUrl) ||
    sanitizePhotoUrl(user?.avatarUrl) ||
    sanitizePhotoUrl(user?.photoUrl);

  const facePhotoUrl = candidatePhoto || stored.appearance.facePhotoUrl || null;

  const mergedSpec = sanitizeAvatarSpec({
    ...stored,
    framePreset,
    archetypePreset,
    anthropometrics: {
      ...stored.anthropometrics,
      heightCm,
      weightKg,
      shoulderScale,
      waistScale,
      hipScale,
      chestForm:
        !hasPersistedV2Spec && framePreset !== stored.framePreset
          ? defaultChestFormForFrame(framePreset)
          : stored.anthropometrics.chestForm,
    },
    appearance: {
      ...stored.appearance,
      mstLevel,
      mstUndertone,
      skinToneHex,
      personalColor,
      facePhotoUrl,
    },
  });

  const mergedHash = computeAvatarConfigHash(mergedSpec);
  if (mergedHash === baseSnapshot.avatarConfigHash) {
    return baseSnapshot;
  }

  return {
    spec: mergedSpec,
    avatarConfigHash: mergedHash,
  };
}
