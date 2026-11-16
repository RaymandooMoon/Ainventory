/**
 * Studio Status Capsule & Contextual 3D Control Resolver (DESIGN.md v3 — Outfits AI Model Studio)
 *
 * Pure, framework-free helpers that turn raw VTON fallback reasons into calm, single-line
 * Korean-first studio copy plus exactly one primary inline action, and decide when 3D-only
 * controls (the symmetric angle dock) are meaningful. Raw reason codes never reach visible copy.
 */

export type StudioLang = 'ko' | 'en';

export type StudioCapsuleAction = 'activate' | 'retry' | null;

export interface StudioStatusCapsuleSpec {
  /** One-line, user-language status message. */
  readonly message: string;
  /** Primary inline CTA kind (`activate` → open Profile AI model section, `retry` → re-run synthesis). */
  readonly action: StudioCapsuleAction;
  /** Localized primary CTA label (empty when `action` is null). */
  readonly actionLabel: string;
  /** Whether the quieter secondary "sample fit" action should be offered. */
  readonly offerSample: boolean;
}

const KEY_ACTIONABLE_REASONS: ReadonlySet<string> = new Set([
  'gemini_api_key_not_configured',
  'backend_unavailable',
  'key_missing',
  'gemini_invalid_api_key',
  'gemini_leaked_key',
  'gemini_billing_required',
  'gemini_http_401',
  'gemini_http_403',
]);

const KEY_MISSING_REASONS: ReadonlySet<string> = new Set([
  'gemini_api_key_not_configured',
  'backend_unavailable',
  'key_missing',
]);

const KEY_INVALID_REASONS: ReadonlySet<string> = new Set([
  'gemini_invalid_api_key',
  'gemini_leaked_key',
  'gemini_http_401',
  'gemini_http_403',
]);

function pick(lang: StudioLang, ko: string, en: string): string {
  return lang === 'en' ? en : ko;
}

export function isStudioKeyActionableReason(reason: unknown): boolean {
  return typeof reason === 'string' && KEY_ACTIONABLE_REASONS.has(reason);
}

/** Maps a raw fallback reason to calm studio copy (never exposes the raw code). */
export function formatStudioStatusMessage(reason: unknown, lang: StudioLang = 'ko'): string {
  const code = typeof reason === 'string' ? reason : '';
  if (code === 'empty_outfit') {
    return pick(lang, '옷을 하나 이상 골라 주세요', 'Pick at least one garment');
  }
  if (KEY_MISSING_REASONS.has(code)) {
    return pick(lang, 'AI 모델 피팅이 꺼져 있어요', 'AI model fitting is off');
  }
  if (KEY_INVALID_REASONS.has(code)) {
    return pick(lang, 'AI 모델 연결을 다시 확인해 주세요', 'Please recheck the AI model connection');
  }
  if (code === 'gemini_billing_required') {
    return pick(lang, 'AI 모델 생성 한도가 필요해요', 'AI model generation needs a quota');
  }
  if (code === 'gemini_http_429') {
    return pick(lang, '잠시 후 다시 입혀볼게요', 'We will try the fitting again shortly');
  }
  if (code.startsWith('gemini_empty_image_')) {
    return pick(
      lang,
      '이미지를 만들지 못했어요 — 옷 조합을 바꿔 보세요',
      'Could not render the look — try another combination'
    );
  }
  return pick(lang, '플랫레이 룩북으로 보여드릴게요', 'Showing your flat-lay lookbook');
}

/** Resolves the full capsule spec (message + single primary action + sample offer). */
export function resolveStudioStatusCapsule(
  reason: unknown,
  lang: StudioLang = 'ko'
): StudioStatusCapsuleSpec {
  const message = formatStudioStatusMessage(reason, lang);
  if (reason === 'empty_outfit') {
    return { message, action: null, actionLabel: '', offerSample: false };
  }
  if (isStudioKeyActionableReason(reason)) {
    return {
      message,
      action: 'activate',
      actionLabel: pick(lang, 'AI 모델 피팅 활성화', 'Enable AI model fitting'),
      offerSample: true,
    };
  }
  return {
    message,
    action: 'retry',
    actionLabel: pick(lang, '다시 입혀보기', 'Try again'),
    offerSample: true,
  };
}

export interface AngleDockVisibilityInput {
  readonly stageMode: string;
  readonly hasAiImage: boolean;
  readonly aiLoading: boolean;
  readonly demoShowcaseActive: boolean;
}

/**
 * The symmetric 3D angle dock only makes sense when an AI model view exists (rendered, rendering,
 * or sample showcase). In the 2D flat-lay lookbook it is hidden but keeps its reserved slot.
 */
export function shouldShowStudioAngleDock(input: AngleDockVisibilityInput): boolean {
  if (input.stageMode !== 'ai-vton') return false;
  return Boolean(input.hasAiImage || input.aiLoading || input.demoShowcaseActive);
}
