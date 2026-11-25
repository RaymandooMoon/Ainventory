import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STAGE_INTERACTION_STATE,
  type StageInteractionState,
} from '../../src/three/ainvtryStageDirector.ts';
import { SITE_COPY } from '../../src/site/siteContent.ts';
import {
  getTopControlsDockKind,
  normalizeTurntableDegrees,
} from '../../src/site/hud/topControlsDockState.ts';

function makeInteraction(patch: Partial<StageInteractionState> = {}): StageInteractionState {
  return { ...DEFAULT_STAGE_INTERACTION_STATE, ...patch };
}

describe('getTopControlsDockKind', () => {
  it('returns studio-3d when Specs stage is on 3D Fitting or Care Three.js background subtabs', () => {
    assert.equal(
      getTopControlsDockKind('specs', makeInteraction({ specsSubtab: 'fitting' }), SITE_COPY.en),
      'studio-3d'
    );
    assert.equal(
      getTopControlsDockKind('specs', makeInteraction({ specsSubtab: 'care' }), SITE_COPY.ko),
      'studio-3d'
    );
  });

  it('returns none for Studio live-app-only stage and Specs Metrics/Stack subtabs', () => {
    assert.equal(
      getTopControlsDockKind('studio', makeInteraction({ studioSubtab: 'preview' }), SITE_COPY.en),
      'none'
    );
    assert.equal(
      getTopControlsDockKind('studio', makeInteraction({ studioSubtab: 'atelier' }), SITE_COPY.en),
      'none'
    );
    assert.equal(
      getTopControlsDockKind('specs', makeInteraction({ specsSubtab: 'kpi' }), SITE_COPY.en),
      'none'
    );
    assert.equal(
      getTopControlsDockKind('specs', makeInteraction({ specsSubtab: 'matrix' }), SITE_COPY.ko),
      'none'
    );
  });

  it('returns arch-mode for Architecture Blueprint subtab', () => {
    assert.equal(
      getTopControlsDockKind(
        'architecture',
        makeInteraction({ architectureSubtab: 'blueprint' }),
        SITE_COPY.en
      ),
      'arch-mode'
    );
  });

  it('returns arch-weather for Architecture Google API subtab only when weather node is active', () => {
    const weatherIdx = SITE_COPY.en.architecture.mapsNodes.findIndex((n) => n.id === 'weather');
    const nonWeatherIdx = SITE_COPY.en.architecture.mapsNodes.findIndex((n) => n.id !== 'weather');
    assert.ok(weatherIdx >= 0);
    assert.ok(nonWeatherIdx >= 0);

    assert.equal(
      getTopControlsDockKind(
        'architecture',
        makeInteraction({ architectureSubtab: 'maps', googleApiIndex: weatherIdx }),
        SITE_COPY.en
      ),
      'arch-weather'
    );

    assert.equal(
      getTopControlsDockKind(
        'architecture',
        makeInteraction({ architectureSubtab: 'maps', googleApiIndex: nonWeatherIdx }),
        SITE_COPY.en
      ),
      'none'
    );
  });

  it('returns none for Architecture Privacy and About stages', () => {
    assert.equal(
      getTopControlsDockKind(
        'architecture',
        makeInteraction({ architectureSubtab: 'privacy' }),
        SITE_COPY.en
      ),
      'none'
    );
    assert.equal(getTopControlsDockKind('about', makeInteraction(), SITE_COPY.ko), 'none');
  });
});

describe('normalizeTurntableDegrees', () => {
  it('normalizes positive, negative, and full-turn angles into [0, 359] without -0', () => {
    assert.equal(Object.is(normalizeTurntableDegrees(0), 0), true);
    assert.equal(normalizeTurntableDegrees(Math.PI * 0.25), 45);
    assert.equal(normalizeTurntableDegrees(-Math.PI * 0.25), 315);
    assert.equal(Object.is(normalizeTurntableDegrees(Math.PI * 2), 0), true);
    assert.equal(Object.is(normalizeTurntableDegrees(-Math.PI * 2), 0), true);
  });

  it('returns 0 safely for non-finite inputs', () => {
    assert.equal(normalizeTurntableDegrees(Number.NaN), 0);
    assert.equal(normalizeTurntableDegrees(Number.POSITIVE_INFINITY), 0);
  });
});
