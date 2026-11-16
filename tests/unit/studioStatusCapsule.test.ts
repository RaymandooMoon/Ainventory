import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatStudioStatusMessage,
  isStudioKeyActionableReason,
  resolveStudioStatusCapsule,
  shouldShowStudioAngleDock,
} from '../../src/services/studioStatusCapsule.ts';

describe('Studio status capsule (DESIGN.md v3 calm AI model fitting copy)', () => {
  it('frames a missing key as a studio feature with the activate CTA', () => {
    const spec = resolveStudioStatusCapsule('gemini_api_key_not_configured', 'ko');
    assert.equal(spec.message, 'AI 모델 피팅이 꺼져 있어요');
    assert.equal(spec.action, 'activate');
    assert.equal(spec.actionLabel, 'AI 모델 피팅 활성화');
    assert.equal(spec.offerSample, true);
  });

  it('routes every key/permission/billing reason to activation, transient ones to retry', () => {
    for (const reason of [
      'backend_unavailable',
      'gemini_invalid_api_key',
      'gemini_leaked_key',
      'gemini_billing_required',
      'gemini_http_401',
      'gemini_http_403',
    ]) {
      assert.equal(isStudioKeyActionableReason(reason), true, reason);
      assert.equal(resolveStudioStatusCapsule(reason).action, 'activate', reason);
    }
    for (const reason of ['gemini_http_429', 'gemini_empty_image_SAFETY', 'gemini_unavailable']) {
      assert.equal(isStudioKeyActionableReason(reason), false, reason);
      const spec = resolveStudioStatusCapsule(reason, 'ko');
      assert.equal(spec.action, 'retry', reason);
      assert.equal(spec.actionLabel, '다시 입혀보기');
    }
  });

  it('never leaks raw reason codes or internal jargon into visible copy', () => {
    const reasons = [
      'gemini_api_key_not_configured',
      'gemini_invalid_api_key',
      'gemini_billing_required',
      'gemini_http_429',
      'gemini_empty_image_SAFETY',
      'gemini_unknown_failure',
      undefined,
    ];
    for (const reason of reasons) {
      for (const lang of ['ko', 'en'] as const) {
        const msg = formatStudioStatusMessage(reason, lang);
        assert.ok(msg.length > 0);
        assert.doesNotMatch(msg, /gemini_|\[|API 키|크레딧|누끼|V\d/i, `${String(reason)}/${lang}`);
      }
    }
  });

  it('asks for a garment without CTA or sample offer on empty outfits', () => {
    const spec = resolveStudioStatusCapsule('empty_outfit', 'ko');
    assert.equal(spec.message, '옷을 하나 이상 골라 주세요');
    assert.equal(spec.action, null);
    assert.equal(spec.offerSample, false);
  });

  it('localizes to English when requested', () => {
    const spec = resolveStudioStatusCapsule('gemini_api_key_not_configured', 'en');
    assert.equal(spec.actionLabel, 'Enable AI model fitting');
  });
});

describe('Contextual 3D angle dock visibility', () => {
  it('hides the dock in the 2D flat-lay lookbook', () => {
    assert.equal(
      shouldShowStudioAngleDock({
        stageMode: 'flatlay',
        hasAiImage: true,
        aiLoading: false,
        demoShowcaseActive: false,
      }),
      false
    );
    assert.equal(
      shouldShowStudioAngleDock({
        stageMode: 'ai-vton',
        hasAiImage: false,
        aiLoading: false,
        demoShowcaseActive: false,
      }),
      false
    );
  });

  it('shows the dock only for a rendered, rendering, or sample AI model view', () => {
    const base = { stageMode: 'ai-vton', hasAiImage: false, aiLoading: false, demoShowcaseActive: false };
    assert.equal(shouldShowStudioAngleDock({ ...base, hasAiImage: true }), true);
    assert.equal(shouldShowStudioAngleDock({ ...base, aiLoading: true }), true);
    assert.equal(shouldShowStudioAngleDock({ ...base, demoShowcaseActive: true }), true);
  });
});
