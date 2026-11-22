import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeChromaticProjection,
  cutoutStudioBackdropToRgba,
  reconcileAiCutoutWithStudioBackdrop,
} from '../../src/services/cutoutService.ts';

function paintRect(
  buf: Uint8ClampedArray,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const idx = (y * w + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
}

describe('Chromatic Opponent-Space Studio Matting — Neutral & Grey Pants Cutout Protection', () => {
  it('separates neutral grey sweatpants and orthogonal denim from all 4 muted chromatic studio keys via zero-mean chroma projection', () => {
    const keys: ReadonlyArray<{ name: string; rgb: [number, number, number] }> = [
      { name: 'muted-sage #62937E', rgb: [98, 147, 126] },
      { name: 'sage-green #5E9C7E', rgb: [94, 156, 126] },
      { name: 'cool-slate #94A3B8', rgb: [148, 163, 184] },
      { name: 'muted-plum #8E6F9E', rgb: [142, 111, 158] },
      { name: 'terracotta #B38368', rgb: [179, 131, 104] },
    ];

    for (const key of keys) {
      const [eR, eG, eB] = key.rgb;
      const pureBg = computeChromaticProjection(eR, eG, eB, eR, eG, eB);
      assert.equal(pureBg.isChromaticKey, true, `${key.name} should be classified as chromatic`);
      assert.ok(Math.abs(pureBg.projRatio - 1) < 1e-6);
      assert.ok(pureBg.perpChroma < 1e-6);

      // Neutral grey sweatpants right at matching luminance: projRatio ~ 0.0 (never >= 0.54!)
      const midL = Math.round((eR + eG + eB) / 3);
      const greyPant = computeChromaticProjection(midL - 1, midL + 1, midL, eR, eG, eB);
      assert.ok(
        greyPant.projRatio < 0.12,
        `${key.name}: expected grey pant projRatio < 0.12, got ${greyPant.projRatio}`
      );
    }

    // Light-blue denim on #62937E green has huge orthogonal chroma deviation (`perpChroma > maxPerpAllowed`)
    const blueDenimOnGreen = computeChromaticProjection(120, 145, 175, 98, 147, 126);
    assert.ok(
      blueDenimOnGreen.perpChroma > blueDenimOnGreen.maxPerpAllowed * 2,
      `Expected blue denim perpChroma (${blueDenimOnGreen.perpChroma}) >> maxPerpAllowed (${blueDenimOnGreen.maxPerpAllowed})`
    );
  });

  it('preserves shaded heather-grey sweatpants with soft anti-aliased edges on muted #62937E backdrop with 0 eaten pixels, 0 brown/magenta stains, and clean inter-leg cutout', () => {
    const w = 180;
    const h = 260;
    const bgR = 98;
    const bgG = 147;
    const bgB = 126;
    const rgba = new Uint8ClampedArray(w * h * 4);
    paintRect(rgba, w, 0, w - 1, 0, h - 1, bgR, bgG, bgB, 255);

    // Head + dark puffer jacket torso
    paintRect(rgba, w, 76, 104, 18, 50, 218, 178, 152);
    paintRect(rgba, w, 52, 128, 51, 134, 34, 38, 44);

    // Heather grey sweatpants with shaded creases whose Euclidean RGB distance to #62937E is only 31..35 (< DEFAULT_TOLERANCE 38!)
    // Plus a 2px soft gradient border (low Sobel gradient!) that previously let BFS breach straight into the calves!
    const drawSoftGreyLeg = (x0: number, x1: number) => {
      for (let y = 135; y <= 226; y += 1) {
        // 1px 50/50 anti-aliased transition outside edge
        for (const edgeX of [x0 - 1, x1 + 1]) {
          const idx = (y * w + edgeX) * 4;
          rgba[idx] = Math.round((bgR + 116) * 0.5);
          rgba[idx + 1] = Math.round((bgG + 119) * 0.5);
          rgba[idx + 2] = Math.round((bgB + 117) * 0.5);
          rgba[idx + 3] = 255;
        }
        for (let x = x0; x <= x1; x += 1) {
          // Outer & inner shaded folds around [114..128, 117..131, 115..129] (Euclidean dist 32..36 from #62937E!)
          const edgeDist = Math.min(x - x0, x1 - x);
          const shade = edgeDist <= 4 ? 114 + edgeDist * 2 : 126 + ((x + y) % 5);
          const idx = (y * w + x) * 4;
          rgba[idx] = shade;
          rgba[idx + 1] = shade + 2;
          rgba[idx + 2] = shade + 1;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Hip bridge + two separate pant legs enclosing a central #62937E inter-leg gap (x=86..94)
    paintRect(rgba, w, 62, 118, 135, 154, 124, 126, 125);
    drawSoftGreyLeg(62, 84);
    drawSoftGreyLeg(96, 118);

    // White sneakers at bottom bridging a shaded green inter-ankle triangle
    paintRect(rgba, w, 62, 85, 227, 240, 236, 236, 234);
    paintRect(rgba, w, 95, 118, 227, 240, 236, 236, 234);

    // Simulate enclosed green pocket between upper thighs (x=87..93, y=155..185) by placing a floor bridge
    paintRect(rgba, w, 86, 94, 155, 226, bgR, bgG, bgB, 255);

    cutoutStudioBackdropToRgba(rgba, w, h);

    // 1. Outer #62937E backdrop corners & inter-leg green gap MUST be completely transparent
    assert.equal(rgba[(4 * w + 4) * 4 + 3], 0);
    assert.equal(rgba[(250 * w + 172) * 4 + 3], 0);
    assert.equal(rgba[(180 * w + 90) * 4 + 3], 0);
    assert.equal(rgba[(215 * w + 90) * 4 + 3], 0);

    // 2. EVERY interior pixel of BOTH grey sweatpants legs MUST remain 100% opaque with ZERO brown/magenta staining
    let eatenPixels = 0;
    let brownStainedPixels = 0;
    for (let y = 156; y <= 225; y += 1) {
      for (const [lx0, lx1] of [
        [63, 83],
        [97, 117],
      ] as const) {
        for (let x = lx0; x <= lx1; x += 1) {
          const i = (y * w + x) * 4;
          const r = rgba[i];
          const g = rgba[i + 1];
          const a = rgba[i + 3];
          if (a < 235) eatenPixels += 1;
          if (r - g > 10) brownStainedPixels += 1;
        }
      }
    }
    assert.equal(eatenPixels, 0, `Expected 0 eroded grey pant pixels, found ${eatenPixels}`);
    assert.equal(
      brownStainedPixels,
      0,
      `Expected 0 brown/magenta unmix stained pant pixels, found ${brownStainedPixels}`
    );
  });

  it('protects neutral grey & taupe trousers across muted plum (#8E6F9E), cool slate (#94A3B8), and terracotta (#B38368) studio backdrops', () => {
    const scenarios: ReadonlyArray<{
      label: string;
      bg: [number, number, number];
      pant: [number, number, number];
    }> = [
      { label: 'plum #8E6F9E + mid-grey pants', bg: [142, 111, 158], pant: [135, 136, 135] },
      { label: 'slate #94A3B8 + light-grey pants', bg: [148, 163, 184], pant: [158, 160, 159] },
      { label: 'terracotta #B38368 + warm-taupe pants', bg: [179, 131, 104], pant: [156, 140, 128] },
    ];

    for (const sc of scenarios) {
      const w = 140;
      const h = 200;
      const rgba = new Uint8ClampedArray(w * h * 4);
      paintRect(rgba, w, 0, w - 1, 0, h - 1, sc.bg[0], sc.bg[1], sc.bg[2], 255);
      // Dark top + head
      paintRect(rgba, w, 58, 82, 16, 44, 214, 174, 150);
      paintRect(rgba, w, 46, 94, 45, 106, 32, 34, 40);
      // Two trouser legs closely matched in luminance to the studio backdrop
      paintRect(rgba, w, 48, 66, 107, 176, sc.pant[0], sc.pant[1], sc.pant[2]);
      paintRect(rgba, w, 74, 92, 107, 176, sc.pant[0], sc.pant[1], sc.pant[2]);
      // Dark shoes
      paintRect(rgba, w, 48, 66, 177, 188, 28, 28, 32);
      paintRect(rgba, w, 74, 92, 177, 188, 28, 28, 32);

      cutoutStudioBackdropToRgba(rgba, w, h);

      assert.equal(rgba[(3 * w + 3) * 4 + 3], 0, `${sc.label}: outer corner must be transparent`);
      assert.equal(rgba[(145 * w + 70) * 4 + 3], 0, `${sc.label}: inter-leg backdrop must be transparent`);
      assert.equal(rgba[(145 * w + 57) * 4 + 3], 255, `${sc.label}: left pant leg must remain opaque`);
      assert.equal(rgba[(145 * w + 83) * 4 + 3], 255, `${sc.label}: right pant leg must remain opaque`);
    }
  });

  it('reconciles @imgly false-negative pant erosion on a chromatic studio backdrop without restoring disconnected margin junk or inter-leg gaps', () => {
    const w = 160;
    const h = 220;
    const bg: [number, number, number] = [98, 147, 126];
    const orig = new Uint8ClampedArray(w * h * 4);
    paintRect(orig, w, 0, w - 1, 0, h - 1, bg[0], bg[1], bg[2], 255);

    // Subject: face, dark puffer, grey sweatpants, white sneakers
    paintRect(orig, w, 68, 92, 18, 46, 214, 176, 150);
    paintRect(orig, w, 48, 112, 47, 118, 30, 34, 42);
    paintRect(orig, w, 54, 106, 119, 134, 124, 126, 125); // hip bridge
    paintRect(orig, w, 54, 74, 135, 192, 122, 125, 123); // left pant leg
    paintRect(orig, w, 86, 106, 135, 192, 122, 125, 123); // right pant leg
    paintRect(orig, w, 54, 74, 193, 204, 238, 238, 236); // left sneaker
    paintRect(orig, w, 86, 106, 193, 204, 238, 238, 236); // right sneaker
    // Disconnected stray margin speck at top-left (x=12..18, y=20..26) that @imgly rightly removed
    paintRect(orig, w, 12, 18, 20, 26, 40, 40, 40);

    // Simulate @imgly output: cleanly removes outer backdrop + inter-leg gap + margin speck,
    // BUT mistakenly punches a big hole out of the right grey pant calf (x=88..104, y=155..182)!
    const aiOut = new Uint8ClampedArray(orig);
    cutoutStudioBackdropToRgba(aiOut, w, h);
    paintRect(aiOut, w, 12, 18, 20, 26, 0, 0, 0, 0); // @imgly removed margin speck
    paintRect(aiOut, w, 88, 104, 155, 182, 0, 0, 0, 0); // @imgly falsely ate grey pant calf!

    const reconciled = reconcileAiCutoutWithStudioBackdrop(orig, aiOut, w, h);
    assert.ok(reconciled.restoredPixels >= 400, `Expected pant calf restored, got ${reconciled.restoredPixels}`);

    // Falsely eaten grey pant calf is 100% restored to opaque!
    assert.equal(aiOut[(168 * w + 96) * 4 + 3], 255);
    assert.equal(aiOut[(168 * w + 96) * 4], 122);
    // Genuine inter-leg green gap & outer backdrop stay transparent!
    assert.equal(aiOut[(168 * w + 80) * 4 + 3], 0);
    assert.equal(aiOut[(4 * w + 4) * 4 + 3], 0);
    // Disconnected stray margin speck stays transparent!
    assert.equal(aiOut[(23 * w + 15) * 4 + 3], 0);
  });
});
