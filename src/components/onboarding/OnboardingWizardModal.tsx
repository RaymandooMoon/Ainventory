import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { UserProfile } from '../../contracts/carbonDesignContract.ts';
import {
  ONBOARDING_AGE_GROUP_OPTIONS,
  ONBOARDING_SILHOUETTE_OPTIONS,
  ONBOARDING_STEP_KEYS,
  getDefaultBodyStatsForDemographic,
  normalizeOnboardingAgeGroup,
  selectStarterCapsule6,
} from '../../shared/onboardingStarterCapsule.js';
import { type AvatarArchetypePreset, patchAvatarSpec } from '../../services/avatarSpecStore.ts';
import { saveMemorizedFaceIdentity } from '../../services/faceMemoryStore.ts';
import { findClosestMstFromHex, getMstSwatch } from '../../services/monkSkinTone.ts';
import {
  type OnboardingStepKey,
  completeOnboardingFlow,
  getOnboardingStepIndex,
  importOnboardingStarterCapsule,
  saveOnboardingProgress,
} from '../../services/onboardingService.ts';
import { type BodyShapeKey, saveStoredBodySpec } from '../../services/parametricAvatar3D.ts';
import {
  SEASON_BEST_SWATCHES,
  analyzePortraitSkinTone,
  normalizeSeasonKey,
  saveStoredSkinProfile,
  type PersonalColorSeasonKey,
} from '../../services/skinToneAnalyzer.ts';
import { localizeApiMessage, tx } from '../../utils/i18n.ts';
import { triggerHaptic, withPublicBaseUrl } from '../../utils/nativeBridge.ts';
import BrandLogo from '../auth/BrandLogo.tsx';
import './onboardingAtelier.css';

interface OnboardingWizardModalProps {
  open: boolean;
  initialStep: OnboardingStepKey;
  user: UserProfile;
  theme?: 'light' | 'dark' | string;
  lang?: string;
  onUserUpdated: (nextUser: UserProfile) => void;
  onClosetSeeded?: () => void;
  onDeferred: (nextUser?: UserProfile) => void;
  onCompleted: (result: { user?: UserProfile; nextAction: 'open_outfits' | 'open_add_garment' }) => void;
}

const SEASON_QUICK_CARDS: ReadonlyArray<{
  key: PersonalColorSeasonKey;
  ko: string;
  en: string;
  hex: string;
}> = [
  { key: 'spring_warm', ko: '봄 웜', en: 'Spring', hex: '#E9C6A8' },
  { key: 'summer_cool', ko: '여름 쿨', en: 'Summer', hex: '#E6C7BE' },
  { key: 'autumn_warm', ko: '가을 웜', en: 'Autumn', hex: '#DFBA9B' },
  { key: 'winter_cool', ko: '겨울 쿨', en: 'Winter', hex: '#DFC1BA' },
];

async function readImageFileResized(file: File, maxEdge = 880): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error('Empty image data'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (!w || !h || (w <= maxEdge && h <= maxEdge)) {
          resolve(dataUrl);
          return;
        }
        const scale = maxEdge / Math.max(w, h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function SilhouettePreviewSvg({
  silhouette,
  skinToneHex,
  wearingLook,
  faceAnalyzed,
}: {
  silhouette: string;
  skinToneHex: string;
  wearingLook: boolean;
  faceAnalyzed: boolean;
}) {
  const shoulderMap: Record<string, number> = {
    ectomorph_thin: 28,
    standard_balanced: 34,
    muscular_athletic: 40,
    plus_curvy: 37,
  };
  const waistMap: Record<string, number> = {
    ectomorph_thin: 19,
    standard_balanced: 23,
    muscular_athletic: 22,
    plus_curvy: 29,
  };
  const sw = shoulderMap[silhouette] ?? 34;
  const ww = waistMap[silhouette] ?? 23;

  return (
    <svg viewBox="0 0 120 180" width="70" height="106" aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="60" cy="170" rx="28" ry="5" fill="currentColor" opacity="0.14" />
      <circle
        cx="60"
        cy="28"
        r="13"
        fill={skinToneHex}
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1"
      />
      {faceAnalyzed && (
        <circle
          cx="60"
          cy="28"
          r="17"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      <rect x="56" y="40" width="8" height="8" rx="3" fill={skinToneHex} />
      <path
        d={`M ${60 - sw} 52 Q 60 45 ${60 + sw} 52 L ${60 + ww} 105 Q 60 109 ${60 - ww} 105 Z`}
        fill="currentColor"
        fillOpacity={wearingLook ? 0.82 : 0.16}
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="1.2"
      />
      <path
        d={`M ${60 - ww + 2} 105 L 48 166 L 56 166 L 60 119 L 64 166 L 72 166 L ${60 + ww - 2} 105 Z`}
        fill="currentColor"
        fillOpacity={wearingLook ? 0.64 : 0.12}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export default function OnboardingWizardModal({
  open,
  initialStep,
  user,
  theme = 'dark',
  lang = 'ko',
  onUserUpdated,
  onClosetSeeded,
  onDeferred,
  onCompleted,
}: OnboardingWizardModalProps) {
  const genderLocked = Boolean(user.genderLocked);
  const prefilledGender: 'male' | 'female' = user.gender === 'female' ? 'female' : 'male';
  const hasGoogleGenderPrefill =
    !genderLocked && user.authProvider === 'google' && (user.gender === 'male' || user.gender === 'female');
  const initialAgeGroup = normalizeOnboardingAgeGroup(user.ageGroup, user.age) || '30s';
  const hasGoogleAgePrefill =
    user.authProvider === 'google' && Boolean(normalizeOnboardingAgeGroup(user.ageGroup, user.age));
  const demographicDefaults = getDefaultBodyStatsForDemographic(prefilledGender, initialAgeGroup);

  const [step, setStep] = useState<OnboardingStepKey>(initialStep);
  const [gender, setGender] = useState<'male' | 'female'>(prefilledGender);
  const [ageGroup, setAgeGroup] = useState<string>(initialAgeGroup);
  const [heightCm, setHeightCm] = useState<number>(
    Number(user.heightCm) >= 100 ? Math.round(Number(user.heightCm)) : demographicDefaults.heightCm
  );
  const [weightKg, setWeightKg] = useState<number>(
    Number(user.weightKg) >= 30 ? Math.round(Number(user.weightKg)) : demographicDefaults.weightKg
  );
  const [bodyManuallyEdited, setBodyManuallyEdited] = useState<boolean>(
    Number(user.heightCm) >= 100 && Number(user.weightKg) >= 30
  );
  const [bodyShape, setBodyShape] = useState<BodyShapeKey>(
    ONBOARDING_SILHOUETTE_OPTIONS.some((o) => o.key === user.bodyShape)
      ? (user.bodyShape as BodyShapeKey)
      : 'standard_balanced'
  );

  const initialSeason = normalizeSeasonKey(user.personalColor || 'autumn_warm');
  const [personalColor, setPersonalColor] = useState<PersonalColorSeasonKey>(initialSeason);
  const [skinToneHex, setSkinToneHex] = useState<string>(
    user.skinToneHex || SEASON_QUICK_CARDS.find((c) => c.key === initialSeason)?.hex || '#DFBA9B'
  );
  const [facePhotoUrl, setFacePhotoUrl] = useState<string | null>(null);
  const [faceAnalyzed, setFaceAnalyzed] = useState<boolean>(
    user.onboarding?.steps?.skin_face === 'photo'
  );
  const [analyzingFace, setAnalyzingFace] = useState<boolean>(false);

  const [closetChoice, setClosetChoice] = useState<'capsule' | 'upload' | 'empty'>('capsule');
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const starterCapsulePreview = useMemo(
    () => selectStarterCapsule6({ personalColor, gender, ageGroup }),
    [personalColor, gender, ageGroup]
  );

  const stepIndex = getOnboardingStepIndex(step);
  const seasonMeta = SEASON_BEST_SWATCHES[personalColor] || SEASON_BEST_SWATCHES.autumn_warm;
  const ageGroupLabel = useMemo(() => {
    const found = ONBOARDING_AGE_GROUP_OPTIONS.find((a) => a.key === ageGroup);
    return found ? tx(lang, found.ko, found.en) : ageGroup;
  }, [ageGroup, lang]);

  if (!open) return null;

  const handleSelectGender = (nextGender: 'male' | 'female') => {
    if (genderLocked || nextGender === gender) return;
    triggerHaptic('selection');
    setGender(nextGender);
    if (!bodyManuallyEdited) {
      const defaults = getDefaultBodyStatsForDemographic(nextGender, ageGroup);
      setHeightCm(defaults.heightCm);
      setWeightKg(defaults.weightKg);
    }
  };

  const handleSelectAgeGroup = (nextAgeGroup: string) => {
    triggerHaptic('selection');
    setAgeGroup(nextAgeGroup);
    if (!bodyManuallyEdited) {
      const defaults = getDefaultBodyStatsForDemographic(gender, nextAgeGroup);
      setHeightCm(defaults.heightCm);
      setWeightKg(defaults.weightKg);
    }
  };

  const handleNudgeHeight = (delta: number) => {
    triggerHaptic('selection');
    setBodyManuallyEdited(true);
    setHeightCm((prev) => Math.max(130, Math.min(220, prev + delta)));
  };

  const handleNudgeWeight = (delta: number) => {
    triggerHaptic('selection');
    setBodyManuallyEdited(true);
    setWeightKg((prev) => Math.max(35, Math.min(160, prev + delta)));
  };

  const handleFaceFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAnalyzingFace(true);
    setErrorMsg('');
    try {
      const resizedUrl = await readImageFileResized(file, 880);
      const analysis = await analyzePortraitSkinTone(resizedUrl, { lightingMode: 'auto_d65' });
      const nextSeason = normalizeSeasonKey(analysis.personalColor);
      const nextHex = analysis.skinToneHex || skinToneHex;
      const mst = findClosestMstFromHex(nextHex);
      const swatch = getMstSwatch(mst.level, mst.undertone);

      setPersonalColor(nextSeason);
      setSkinToneHex(nextHex);
      setFacePhotoUrl(analysis.singleFacePortraitDataUrl || resizedUrl);
      setFaceAnalyzed(true);

      await saveMemorizedFaceIdentity({
        sourceImageDataUrl: resizedUrl,
        singleFacePortraitDataUrl: analysis.singleFacePortraitDataUrl || resizedUrl,
        lightingMode: 'auto_d65',
        manualFaceBox: null,
        selectedFaceIndex: null,
        analysisSnapshot: {
          ...analysis,
          skinToneHex: nextHex,
          personalColor: nextSeason,
          personalColorLabelKo: SEASON_BEST_SWATCHES[nextSeason].labelKo,
          mstLevel: mst.level,
          mstUndertone: mst.undertone,
          mstCode: swatch.code,
          detectedFaceCount: analysis.detectedFaceCount || 1,
        },
      }).catch(() => {});

      triggerHaptic('medium');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setErrorMsg(
        localizeApiMessage(raw, lang) ||
          tx(
            lang,
            '얼굴 사진 분석에 실패했습니다. 밝은 자연광 정면 사진을 선택하거나 아래 4계절 톤을 바로 골라 주세요.',
            'Could not analyze the face photo. Try a well-lit front photo or pick a seasonal tone below.'
          )
      );
    } finally {
      setAnalyzingFace(false);
    }
  };

  const handleSelectQuickSeason = (card: (typeof SEASON_QUICK_CARDS)[number]) => {
    triggerHaptic('selection');
    setPersonalColor(card.key);
    setSkinToneHex(card.hex);
    setFaceAnalyzed(false);
  };

  const handleDefer = async () => {
    if (saving) return;
    triggerHaptic('selection');
    setSaving(true);
    try {
      const res = await saveOnboardingProgress({
        status: 'deferred',
        currentStep: step,
      });
      if (res?.user) {
        onUserUpdated(res.user);
      }
      onDeferred(res?.user);
    } catch {
      onDeferred();
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (saving || stepIndex <= 0) return;
    triggerHaptic('selection');
    setErrorMsg('');
    setStep(ONBOARDING_STEP_KEYS[stepIndex - 1] as OnboardingStepKey);
  };

  const handleContinue = async () => {
    if (saving || analyzingFace) return;
    setErrorMsg('');
    setSaving(true);
    try {
      if (step === 'identity_body') {
        const res = await saveOnboardingProgress({
          status: 'in_progress',
          currentStep: 'skin_face',
          gender,
          lockGender: true,
          ageGroup,
          heightCm,
          weightKg,
          bodyShape,
          stepsPatch: { identity_body: true },
        });
        saveStoredBodySpec({ gender, heightCm, weightKg, bodyShape });
        const mappedArchetype =
          ONBOARDING_SILHOUETTE_OPTIONS.find((o) => o.key === bodyShape)?.archetype || 'rectangle';
        const archetypePreset: AvatarArchetypePreset =
          gender === 'female' && bodyShape === 'standard_balanced'
            ? 'hourglass'
            : (mappedArchetype as AvatarArchetypePreset);
        patchAvatarSpec({
          framePreset: gender === 'female' ? 'feminine' : 'masculine',
          archetypePreset,
          anthropometrics: { heightCm, weightKg },
        });
        if (res?.user) onUserUpdated(res.user);
        triggerHaptic('selection');
        setStep('skin_face');
        return;
      }

      if (step === 'skin_face') {
        const res = await saveOnboardingProgress({
          status: 'in_progress',
          currentStep: 'closet_seed',
          personalColor,
          skinToneHex,
          stepsPatch: { skin_face: faceAnalyzed ? 'photo' : 'season' },
        });
        const mst = findClosestMstFromHex(skinToneHex);
        const swatch = getMstSwatch(mst.level, mst.undertone);
        saveStoredSkinProfile({
          skinToneHex,
          personalColor,
          personalColorLabelKo: seasonMeta.labelKo,
          gender,
          mstLevel: mst.level,
          mstUndertone: mst.undertone,
          mstCode: swatch.code,
          ...(facePhotoUrl ? { portraitDataUrl: facePhotoUrl } : {}),
        });
        patchAvatarSpec({
          appearance: {
            skinToneHex,
            personalColor,
            mstLevel: mst.level,
            mstUndertone: mst.undertone,
            ...(facePhotoUrl ? { facePhotoUrl } : {}),
          },
        });
        if (res?.user) onUserUpdated(res.user);
        triggerHaptic('selection');
        setStep('closet_seed');
        return;
      }

      if (step === 'closet_seed') {
        if (closetChoice === 'capsule') {
          const res = await importOnboardingStarterCapsule({
            personalColor,
            gender,
            ageGroup,
          });
          if (res?.user) onUserUpdated(res.user);
          onClosetSeeded?.();
        } else {
          const res = await saveOnboardingProgress({
            status: 'in_progress',
            currentStep: 'first_tryon',
            stepsPatch: { closet_seed: closetChoice },
          });
          if (res?.user) onUserUpdated(res.user);
        }
        triggerHaptic('medium');
        setStep('first_tryon');
        return;
      }

      // Step 4: Final completion
      const completedRes = await completeOnboardingFlow({
        identity_body: true,
        skin_face: faceAnalyzed ? 'photo' : 'season',
        closet_seed: closetChoice,
        first_tryon: true,
      });
      if (completedRes?.user) onUserUpdated(completedRes.user);
      triggerHaptic('medium');
      onCompleted({
        user: completedRes?.user,
        nextAction: closetChoice === 'upload' ? 'open_add_garment' : 'open_outfits',
      });
    } catch (err) {
      triggerHaptic('warning');
      const raw = err instanceof Error ? err.message : '';
      setErrorMsg(
        localizeApiMessage(raw, lang) ||
          tx(
            lang,
            '설정을 저장하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            'Could not save your setup right now. Please try again.'
          )
      );
    } finally {
      setSaving(false);
    }
  };

  const primaryCtaLabel = (() => {
    if (saving) return tx(lang, '저장 중...', 'Saving...');
    if (step === 'closet_seed' && closetChoice === 'capsule') {
      return tx(lang, '스타터 캡슐 6벌 담고 계속', 'Add 6-Piece Capsule & Continue');
    }
    if (step === 'first_tryon') {
      return closetChoice === 'upload'
        ? tx(lang, '첫 옷 등록하러 가기', 'Add Your First Garment')
        : tx(lang, '내 아틀리에 시작하기', 'Start My Atelier');
    }
    return tx(lang, '계속', 'Continue');
  })();

  const closetSummaryLabel =
    closetChoice === 'capsule'
      ? tx(lang, '맞춤 스타터 캡슐 6벌 준비됨', 'Tailored 6-Piece Capsule Ready')
      : closetChoice === 'upload'
        ? tx(lang, '내 옷 1벌 바로 등록 예정', 'Ready to Upload 1st Garment')
        : tx(lang, '빈 옷장으로 시작', 'Starting with Empty Closet');

  return (
    <div
      className="ob-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ob-step-title"
      data-testid="onboarding-wizard-modal"
      data-onboarding-step={step}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          void handleDefer();
        }
      }}
    >
      <div className="ob-sheet" data-theme={theme}>
        <div className="ob-header">
          <div className="ob-header-row">
            {stepIndex > 0 ? (
              <button
                type="button"
                className="ob-ghost-btn"
                onClick={handleBack}
                disabled={saving}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>{tx(lang, '이전', 'Back')}</span>
              </button>
            ) : (
              <div className="ob-brand-wrap">
                <BrandLogo effectiveTheme={theme} alt="iNVTRY" />
              </div>
            )}

            <button
              id="onboarding-defer-btn"
              type="button"
              className="ob-ghost-btn"
              onClick={() => void handleDefer()}
              disabled={saving}
            >
              {tx(lang, '나중에 하기', 'Later')}
            </button>
          </div>

          <div
            className="ob-progress-rail"
            aria-label={tx(lang, `4단계 중 ${stepIndex + 1}단계`, `Step ${stepIndex + 1} of 4`)}
          >
            {ONBOARDING_STEP_KEYS.map((key, idx) => (
              <div key={key} className="ob-progress-seg">
                <div
                  className="ob-progress-fill"
                  style={{ width: idx <= stepIndex ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="ob-body">
          {/* STEP 1: GENDER (LOCKED ONCE CONFIRMED) · AGE GROUP · HEIGHT/WEIGHT · SILHOUETTE */}
          {step === 'identity_body' && (
            <>
              <div className="ob-step-head">
                <span className="ob-kicker">STEP 01 / 04</span>
                <h2 id="ob-step-title" className="ob-title">
                  {tx(lang, '기본 프로필과 체형을 맞춰주세요', 'Set Your Profile & Proportions')}
                </h2>
                <p className="ob-subtitle">
                  {tx(
                    lang,
                    '성별과 연령대에 맞춘 평균 체형이 자동 입력됩니다. 맞으면 바로 계속을 누르세요.',
                    'Average proportions are pre-filled by gender and age group—adjust or tap Continue.'
                  )}
                </p>
              </div>

              <div className="ob-silhouette-stage">
                <SilhouettePreviewSvg
                  silhouette={bodyShape}
                  skinToneHex={skinToneHex}
                  wearingLook={false}
                  faceAnalyzed={faceAnalyzed}
                />
                <div className="ob-silhouette-meta">
                  <span className="ob-kicker">{tx(lang, '실시간 비율', 'LIVE PROPORTIONS')}</span>
                  <div className="ob-meta-chips">
                    <span className="ob-meta-chip">
                      {gender === 'female' ? tx(lang, '여성', 'Female') : tx(lang, '남성', 'Male')}
                    </span>
                    <span className="ob-meta-chip">{ageGroupLabel}</span>
                    <span className="ob-meta-chip">
                      {heightCm}cm · {weightKg}kg
                    </span>
                  </div>
                </div>
              </div>

              {/* Gender Segmented Selector + Permanent Lock Notice */}
              <div className="ob-section">
                <div className="ob-section-head">
                  <span className="ob-label">{tx(lang, '성별', 'Gender')}</span>
                  {genderLocked ? (
                    <span className="ob-micro-hint" data-testid="onboarding-gender-locked-badge">
                      <Lock size={11} aria-hidden="true" />
                      <span>{tx(lang, '확정됨 · 변경 불가', 'Confirmed · Locked')}</span>
                    </span>
                  ) : hasGoogleGenderPrefill ? (
                    <span className="ob-micro-hint">
                      {tx(lang, 'Google에서 자동 선택 · 확정 후 변경 불가', 'Prefilled via Google · Locked once confirmed')}
                    </span>
                  ) : (
                    <span className="ob-micro-hint">
                      <Lock size={11} aria-hidden="true" />
                      <span>{tx(lang, '확정 후 변경 불가', 'Cannot be changed once confirmed')}</span>
                    </span>
                  )}
                </div>
                <div className="ob-segmented" role="radiogroup" aria-label={tx(lang, '성별 선택', 'Select Gender')}>
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={gender === g}
                      data-onboarding-gender={g}
                      disabled={genderLocked}
                      className={`ob-seg-btn ${gender === g ? 'is-active' : ''}`}
                      onClick={() => handleSelectGender(g)}
                    >
                      {genderLocked && gender === g && <Lock size={12} aria-hidden="true" />}
                      <span>{g === 'male' ? tx(lang, '남성', 'Male') : tx(lang, '여성', 'Female')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Age Group Selector */}
              <div className="ob-section">
                <div className="ob-section-head">
                  <span className="ob-label">{tx(lang, '연령대', 'Age Group')}</span>
                  <span className="ob-micro-hint">
                    {hasGoogleAgePrefill
                      ? tx(lang, 'Google 생년월일 반영 · 스타일·소비 분석 활용', 'From Google · Tailors style & spend insights')
                      : tx(lang, '스타일 · 소비 추천 기준', 'Tailors style & budget cues')}
                  </span>
                </div>
                <div className="ob-age-grid">
                  {ONBOARDING_AGE_GROUP_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      data-onboarding-age={opt.key}
                      aria-pressed={ageGroup === opt.key}
                      className={`ob-pill-choice ${ageGroup === opt.key ? 'is-selected' : ''}`}
                      onClick={() => handleSelectAgeGroup(opt.key)}
                    >
                      {tx(lang, opt.ko, opt.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Height & Weight Quick Steppers */}
              <div className="ob-stepper-grid">
                <div className="ob-stepper-card">
                  <span className="ob-label">{tx(lang, '신장', 'Height')}</span>
                  <div className="ob-stepper-row">
                    <button
                      type="button"
                      className="ob-stepper-btn"
                      aria-label={tx(lang, '신장 1cm 줄이기', 'Decrease height by 1 cm')}
                      onClick={() => handleNudgeHeight(-1)}
                    >
                      −
                    </button>
                    <span className="ob-stepper-val" data-testid="onboarding-height-value">
                      {heightCm}
                      <span className="ob-stepper-unit">cm</span>
                    </span>
                    <button
                      type="button"
                      className="ob-stepper-btn"
                      aria-label={tx(lang, '신장 1cm 늘리기', 'Increase height by 1 cm')}
                      onClick={() => handleNudgeHeight(1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="ob-stepper-card">
                  <span className="ob-label">{tx(lang, '체중', 'Weight')}</span>
                  <div className="ob-stepper-row">
                    <button
                      type="button"
                      className="ob-stepper-btn"
                      aria-label={tx(lang, '체중 1kg 줄이기', 'Decrease weight by 1 kg')}
                      onClick={() => handleNudgeWeight(-1)}
                    >
                      −
                    </button>
                    <span className="ob-stepper-val" data-testid="onboarding-weight-value">
                      {weightKg}
                      <span className="ob-stepper-unit">kg</span>
                    </span>
                    <button
                      type="button"
                      className="ob-stepper-btn"
                      aria-label={tx(lang, '체중 1kg 늘리기', 'Increase weight by 1 kg')}
                      onClick={() => handleNudgeWeight(1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Silhouette 4-Choice */}
              <div className="ob-section">
                <span className="ob-label">{tx(lang, '실루엣', 'Silhouette')}</span>
                <div className="ob-sil-grid">
                  {ONBOARDING_SILHOUETTE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      data-onboarding-silhouette={opt.key}
                      aria-pressed={bodyShape === opt.key}
                      className={`ob-pill-choice ${bodyShape === opt.key ? 'is-selected' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBodyShape(opt.key as BodyShapeKey);
                      }}
                    >
                      {tx(lang, opt.ko, opt.en)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* STEP 2: SKIN TONE & FACE (PATH A HERO: 1 FACE PHOTO AUTO-ANALYSIS) */}
          {step === 'skin_face' && (
            <>
              <div className="ob-step-head">
                <span className="ob-kicker">STEP 02 / 04</span>
                <h2 id="ob-step-title" className="ob-title">
                  {tx(lang, '얼굴 사진 1장으로 피부톤 자동 측정', 'Auto-Measure Skin Tone with 1 Photo')}
                </h2>
                <p className="ob-subtitle">
                  {tx(
                    lang,
                    '온디바이스 AI가 피부톤과 퍼스널컬러를 즉시 분석합니다. 사진은 서버로 전송되지 않고 기기에만 보관됩니다.',
                    'On-device AI extracts your skin tone and seasonal palette. Photos stay strictly on your device.'
                  )}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFaceFileSelected}
              />

              <button
                id="onboarding-face-photo-btn"
                type="button"
                className={`ob-hero-card ${faceAnalyzed ? 'is-selected' : ''}`}
                disabled={analyzingFace}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="ob-hero-card-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      className="ob-hero-icon-circle"
                      style={!facePhotoUrl && faceAnalyzed ? { background: skinToneHex, color: '#1D1D1F' } : undefined}
                    >
                      {analyzingFace ? (
                        <Loader2 size={18} className="hig-spin" />
                      ) : facePhotoUrl ? (
                        <img src={facePhotoUrl} alt={tx(lang, '얼굴 프리뷰', 'Face preview')} />
                      ) : faceAnalyzed ? (
                        <Check size={18} />
                      ) : (
                        <Camera size={18} />
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 640 }}>
                          {analyzingFace
                            ? tx(lang, '피부톤 자동 측정 중...', 'Measuring skin tone...')
                            : faceAnalyzed
                              ? tx(lang, '얼굴 자동 측정 완료', 'Face Tone Measured')
                              : tx(lang, '얼굴 사진 1장 선택 · 촬영', 'Choose or Take 1 Face Photo')}
                        </span>
                        <span className="ob-badge-mono">{tx(lang, '추천', 'Recommended')}</span>
                      </div>
                      <p className="ob-subtitle" style={{ marginTop: 3, fontSize: '0.76rem' }}>
                        {faceAnalyzed
                          ? tx(
                              lang,
                              `${seasonMeta.labelKo} · ${skinToneHex} 추출됨 (다시 측정하려면 탭)`,
                              `${seasonMeta.labelEn} · ${skinToneHex} detected (tap to re-measure)`
                            )
                          : tx(
                              lang,
                              '정면 자연광 사진 1장으로 피부톤과 베스트 팔레트 자동 추출',
                              'Extract skin tone and best palette from one daylight selfie'
                            )}
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              <div className="ob-palette-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ob-swatch-dot" style={{ background: skinToneHex }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {lang === 'en' ? seasonMeta.labelEn : seasonMeta.labelKo}
                  </span>
                </div>
                <div className="ob-swatch-row" aria-label={tx(lang, '추천 컬러 팔레트', 'Recommended palette')}>
                  {seasonMeta.colors.slice(0, 5).map((swatch) => (
                    <span
                      key={swatch.hex}
                      className="ob-swatch-dot"
                      style={{ background: swatch.hex }}
                      title={lang === 'en' ? swatch.nameEn : swatch.name}
                    />
                  ))}
                </div>
              </div>

              <div className="ob-section">
                <span className="ob-label">
                  {tx(lang, '사진이 지금 없다면 · 4계절 톤 1탭 선택', 'No photo handy? Pick a season in 1 tap')}
                </span>
                <div className="ob-season-grid">
                  {SEASON_QUICK_CARDS.map((card) => (
                    <button
                      key={card.key}
                      type="button"
                      data-onboarding-season={card.key}
                      aria-pressed={personalColor === card.key}
                      className={`ob-season-btn ${personalColor === card.key ? 'is-selected' : ''}`}
                      onClick={() => handleSelectQuickSeason(card)}
                    >
                      <span className="ob-swatch-dot" style={{ background: card.hex }} />
                      <span>{tx(lang, card.ko, card.en)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* STEP 3: FIRST CLOSET (OPTION B HERO: TAILORED 6-PIECE STARTER CAPSULE) */}
          {step === 'closet_seed' && (
            <>
              <div className="ob-step-head">
                <span className="ob-kicker">STEP 03 / 04</span>
                <h2 id="ob-step-title" className="ob-title">
                  {tx(lang, '첫 옷장을 어떻게 시작할까요?', 'How Would You Like to Start?')}
                </h2>
                <p className="ob-subtitle">
                  {tx(
                    lang,
                    '바로 가상 피팅을 체험할 수 있게 내 톤과 연령대에 맞춘 기본 캡슐 6벌을 준비했어요.',
                    'We curated 6 versatile staples matched to your tone and style so you can try on immediately.'
                  )}
                </p>
              </div>

              <button
                type="button"
                data-onboarding-closet="capsule"
                className={`ob-hero-card ${closetChoice === 'capsule' ? 'is-selected' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setClosetChoice('capsule');
                }}
              >
                <div className="ob-hero-card-row" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 660 }}>
                        {tx(lang, '내 톤 맞춤 스타터 캡슐 6벌 담기', 'Add Tailored 6-Piece Starter Capsule')}
                      </span>
                      <span className="ob-badge-mono">{tx(lang, '가장 빠른 체험', 'Fastest Start')}</span>
                    </div>
                    <p className="ob-subtitle" style={{ marginTop: 4, fontSize: '0.76rem' }}>
                      {tx(
                        lang,
                        '샘플 표시 · 나중에 설정에서 1탭으로 일괄 정리 가능',
                        'Marked as starter items · One-tap cleanup anytime in Settings'
                      )}
                    </p>
                  </div>
                  <span className={`ob-radio ${closetChoice === 'capsule' ? 'is-checked' : ''}`}>
                    {closetChoice === 'capsule' && <Check size={12} strokeWidth={2.8} />}
                  </span>
                </div>

                <div className="ob-capsule-grid">
                  {starterCapsulePreview.map((item) => (
                    <div key={item.key} className="ob-capsule-tile">
                      <div className="ob-capsule-thumb">
                        <img
                          src={withPublicBaseUrl(item.image_url)}
                          alt={lang === 'en' ? item.name_en : item.name}
                          loading="lazy"
                        />
                      </div>
                      <span className="ob-capsule-slot">{item.category}</span>
                    </div>
                  ))}
                </div>
              </button>

              <div className="ob-grouped-list">
                <button
                  type="button"
                  data-onboarding-closet="upload"
                  className={`ob-list-row ${closetChoice === 'upload' ? 'is-selected' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setClosetChoice('upload');
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 620 }}>
                      {tx(lang, '내 옷 사진 1장 바로 올리기', 'Upload 1 Photo of My Own Garment')}
                    </div>
                    <div className="ob-micro-hint" style={{ marginTop: 2 }}>
                      {tx(lang, 'AI 자동 배경 제거 · 카테고리 자동 분류', 'On-device cutout & automatic tagging')}
                    </div>
                  </div>
                  <span className={`ob-radio ${closetChoice === 'upload' ? 'is-checked' : ''}`}>
                    {closetChoice === 'upload' && <Check size={12} strokeWidth={2.8} />}
                  </span>
                </button>

                <button
                  type="button"
                  data-onboarding-closet="empty"
                  className={`ob-list-row ${closetChoice === 'empty' ? 'is-selected' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setClosetChoice('empty');
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 620 }}>
                      {tx(lang, '빈 옷장으로 직접 시작하기', 'Start with an Empty Closet')}
                    </div>
                    <div className="ob-micro-hint" style={{ marginTop: 2 }}>
                      {tx(lang, '나중에 옷장 탭에서 직접 하나씩 등록', 'Add garments at your own pace later')}
                    </div>
                  </div>
                  <span className={`ob-radio ${closetChoice === 'empty' ? 'is-checked' : ''}`}>
                    {closetChoice === 'empty' && <Check size={12} strokeWidth={2.8} />}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* STEP 4: ATELIER READY SUMMARY */}
          {step === 'first_tryon' && (
            <>
              <div className="ob-step-head">
                <span className="ob-kicker">STEP 04 / 04 · READY</span>
                <h2 id="ob-step-title" className="ob-title">
                  {tx(lang, '나만의 아틀리에가 준비되었습니다', 'Your Atelier Is Ready')}
                </h2>
                <p className="ob-subtitle">
                  {tx(
                    lang,
                    '이제 4각도 가상 피팅과 오늘 날씨 맞춤 스타일링을 바로 시작할 수 있어요.',
                    'Try on looks across 4 angles and explore weather-aware styling right away.'
                  )}
                </p>
              </div>

              <div className="ob-silhouette-stage">
                <SilhouettePreviewSvg
                  silhouette={bodyShape}
                  skinToneHex={skinToneHex}
                  wearingLook={closetChoice === 'capsule'}
                  faceAnalyzed={faceAnalyzed}
                />
                <div className="ob-silhouette-meta">
                  <span className="ob-kicker">
                    <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />
                    {tx(lang, '초기 설정 완료', 'SETUP COMPLETE')}
                  </span>
                  <div className="ob-meta-chips">
                    <span className="ob-meta-chip">
                      <span className="ob-swatch-dot" style={{ width: 12, height: 12, background: skinToneHex }} />
                      {lang === 'en' ? seasonMeta.labelEn : seasonMeta.labelKo}
                    </span>
                    {closetChoice === 'capsule' && (
                      <span className="ob-meta-chip">6 ITEMS</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="ob-summary-card">
                <div className="ob-summary-row">
                  <span className="ob-micro-hint">{tx(lang, '프로필 · 체형', 'Profile & Body')}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {gender === 'female' ? tx(lang, '여성', 'Female') : tx(lang, '남성', 'Male')} · {ageGroupLabel} · {heightCm}cm · {weightKg}kg
                  </span>
                </div>
                <div className="ob-summary-row">
                  <span className="ob-micro-hint">{tx(lang, '피부톤 · 톤', 'Skin & Tone')}</span>
                  <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="ob-swatch-dot" style={{ width: 13, height: 13, background: skinToneHex }} />
                    <span>{lang === 'en' ? seasonMeta.labelEn : seasonMeta.labelKo}</span>
                  </span>
                </div>
                <div className="ob-summary-row">
                  <span className="ob-micro-hint">{tx(lang, '첫 옷장 구성', 'First Wardrobe')}</span>
                  <span style={{ fontWeight: 600 }}>{closetSummaryLabel}</span>
                </div>
              </div>
            </>
          )}

          {errorMsg && (
            <div className="ob-error-note" role="alert">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="ob-footer">
          <button
            id="onboarding-primary-cta-btn"
            type="button"
            className="ob-primary-cta"
            disabled={saving || analyzingFace}
            onClick={() => void handleContinue()}
          >
            {saving && <Loader2 size={16} className="hig-spin" aria-hidden="true" />}
            <span>{primaryCtaLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
