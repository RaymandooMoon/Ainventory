import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  cycleLoginThreeVariant,
  getLoginThreeVariantMeta,
  LOGIN_THREE_VARIANTS,
} from '../../src/components/auth/loginThreeScenes.ts';
import {
  computeFloorInsetWorld,
  computeMarbleTargetHit,
  toStageNormalizedCoords,
} from '../../src/components/auth/marbleBackdropMath.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('Login <-> Website shared marble backdrop sync contract', () => {
  it('cycles and resolves metadata dynamically from LOGIN_THREE_VARIANTS', () => {
    assert.ok(LOGIN_THREE_VARIANTS.length >= 2);
    const first = LOGIN_THREE_VARIANTS[0];
    const second = LOGIN_THREE_VARIANTS[1];
    assert.equal(cycleLoginThreeVariant(first.id), second.id);
    const last = LOGIN_THREE_VARIANTS[LOGIN_THREE_VARIANTS.length - 1];
    assert.equal(cycleLoginThreeVariant(last.id), first.id);

    const meta = getLoginThreeVariantMeta(second.id);
    assert.equal(meta.id, second.id);
    assert.equal(meta.shortEn, second.shortEn);
    assert.equal(meta.shortKo, second.shortKo);
  });

  it('computes safe world-space bottom floor inset strictly within [0, 0.85]', () => {
    assert.equal(computeFloorInsetWorld(900, 900, 837), (63 / 900) * 2);
    assert.equal(computeFloorInsetWorld(900, 900, 950), 0);
    assert.equal(computeFloorInsetWorld(900, 0, 800), 0);
    assert.equal(computeFloorInsetWorld(900, 900, 100), 0.85);
  });

  it('normalizes client coordinates into [-1, 1] stage space', () => {
    const center = toStageNormalizedCoords(500, 300, { left: 100, top: 100, width: 800, height: 400 });
    assert.equal(center.nx, 0);
    assert.equal(center.ny, 0);
    const topLeft = toStageNormalizedCoords(100, 100, { left: 100, top: 100, width: 800, height: 400 });
    assert.equal(topLeft.nx, -1);
    assert.equal(topLeft.ny, 1);
  });

  it('detects approaching marble collisions against button AABB and ignores receding marbles', () => {
    const rect = { left: 100, right: 220, top: 400, bottom: 444 };
    // Marble approaching from above (moving +y downward in CSS coords)
    const hit = computeMarbleTargetHit({
      mx: 160,
      my: 386,
      hitRadiusPx: 20,
      velPxX: 0,
      velPxY: 180,
      rect,
    });
    assert.ok(hit, 'Expected collision when approaching button');
    assert.equal(hit.cx, 160);
    assert.equal(hit.cy, 400);
    assert.equal(hit.nxPx, 0);
    assert.equal(hit.nyPx, -1);
    assert.ok(hit.overlapPx > 5);

    // Same position, but marble already bouncing away upward (velPxY = -180 along outward normal -1)
    const receding = computeMarbleTargetHit({
      mx: 160,
      my: 386,
      hitRadiusPx: 20,
      velPxX: 0,
      velPxY: -180,
      rect,
    });
    assert.equal(receding, null, 'Receding marble must not double-trigger button');
  });

  it('keeps LoginBackdropCanvas and SiteMarbleHero wired to the single shared hook with website-only floor rail', () => {
    const loginCanvasSrc = fs.readFileSync(
      path.join(repoRoot, 'src/components/auth/LoginBackdropCanvas.tsx'),
      'utf8'
    );
    const siteHeroSrc = fs.readFileSync(
      path.join(repoRoot, 'src/site/SiteMarbleHero.tsx'),
      'utf8'
    );
    const scenesSrc = fs.readFileSync(
      path.join(repoRoot, 'src/components/auth/loginThreeScenes.ts'),
      'utf8'
    );
    const siteAppSrc = fs.readFileSync(
      path.join(repoRoot, 'src/site/AinvtrySiteApp.tsx'),
      'utf8'
    );

    assert.ok(loginCanvasSrc.includes('useMarbleBackdropStage'), 'Login must use shared hook');
    assert.ok(siteHeroSrc.includes('useMarbleBackdropStage'), 'Website must use shared hook');
    assert.ok(
      !loginCanvasSrc.includes('floorRailSelector'),
      'Bottom floor rail must remain website-only and NOT enabled on Login screen'
    );
    assert.ok(
      siteHeroSrc.includes('floorRailSelector'),
      'Website must opt into bottom floor rail containment'
    );
    assert.ok(scenesSrc.includes('setPlayBounds'), 'Engine must expose optional setPlayBounds');
    assert.ok(scenesSrc.includes('onFloorBounce'), 'Engine must expose optional onFloorBounce');
    assert.ok(
      siteAppSrc.includes('cycleLoginThreeVariant') && siteAppSrc.includes('getLoginThreeVariantMeta'),
      'Website must dynamically cycle and label presets from LOGIN_THREE_VARIANTS'
    );
  });
});
