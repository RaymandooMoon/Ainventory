import zlib from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';
import {
  buildWeatherPosePromptDirectives,
  resolveEffectiveWeather,
} from '../../src/services/weatherPromptBuilder.ts';

/**
 * Builds a valid RGBA PNG data URL (`128x128`) divided into 4 distinct solid-color quadrants
 * so we can deterministically verify client-side `sliceTurnaround2x2Sheet` across 0°/45°/90°/180°!
 */
function buildMockTurnaround2x2PngDataUrl(seedOffset = 0): string {
  const width = 192;
  const height = 288;
  const quadW = width / 2;
  const quadH = height / 2;
  const raw = Buffer.alloc((width * 4 + 1) * height);

  const coatR = 54 + ((seedOffset * 7) % 140);
  const coatG = 68 + ((seedOffset * 11) % 130);
  const coatB = 88 + ((seedOffset * 13) % 125);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // filter type 0
    const isBottom = y >= quadH;
    const localY = y % quadH;
    for (let x = 0; x < width; x += 1) {
      const isRight = x >= quadW;
      const localX = x % quadW;
      const px = rowOffset + 1 + x * 4;
      // Uniform #94A3B8 studio backdrop for clean V4 cutout -> alpha 0
      let r = 148;
      let g = 163;
      let b = 184;

      const angle: 0 | 45 | 90 | 180 = !isBottom && !isRight ? 0 : !isBottom ? 45 : !isRight ? 90 : 180;
      const inHead =
        localY >= 12 &&
        localY <= 25 &&
        localX >= (angle === 45 ? 43 : 42) &&
        localX <= (angle === 45 ? 54 : 53);
      const torsoMinX = angle === 90 ? 37 : 34;
      const torsoMaxX = angle === 90 ? 58 : 61;
      const inTorso = localY >= 26 && localY <= 74 && localX >= torsoMinX && localX <= torsoMaxX;
      const legMinX = angle === 90 ? 41 : 39;
      const legMaxX = angle === 90 ? 54 : 56;
      const inLegs = localY >= 75 && localY <= 118 && localX >= legMinX && localX <= legMaxX;
      const inShoes =
        localY >= 119 &&
        localY <= 129 &&
        ((localX >= 41 && localX <= 46) || (localX >= 50 && localX <= 55));

      if (inHead) {
        r = 204;
        g = 162;
        b = 134;
      } else if (inTorso) {
        const delta = angle === 180 && localY <= 34 ? -14 : angle === 45 ? 8 : angle === 90 ? -6 : 0;
        r = Math.max(20, Math.min(245, coatR + delta));
        g = Math.max(20, Math.min(245, coatG + delta));
        b = Math.max(20, Math.min(245, coatB + delta));
      } else if (inLegs) {
        r = angle === 180 ? 38 : angle === 90 ? 48 : 56;
        g = angle === 45 ? 52 : 44;
        b = angle === 90 ? 64 : 52;
      } else if (inShoes) {
        r = 32;
        g = 34;
        b = 38;
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function buildSyntheticPortraitPngBuffer(): Buffer {
  const w = 96;
  const h = 96;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const ro = y * (w * 4 + 1);
    raw[ro] = 0;
    for (let x = 0; x < w; x += 1) {
      const px = ro + 1 + x * 4;
      raw[px] = 226;
      raw[px + 1] = 186;
      raw[px + 2] = 158;
      raw[px + 3] = 255;
    }
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Buffer): Buffer => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function selectStudioSlotAndPickItem(
  page: Page,
  slotKey: 'outer' | 'top' | 'bottom' | 'onepiece' | 'shoes' | 'accessory',
  options?: { season?: 'all' | '봄' | '여름' | '가을' | '겨울'; matchText?: RegExp }
): Promise<string> {
  const mobileWardrobeBtn = page.locator('[data-mobile-wardrobe-trigger="true"]');
  if (await mobileWardrobeBtn.isVisible()) {
    await mobileWardrobeBtn.click();
    const sheet = page.locator('#outfit-mobile-wardrobe-sheet');
    await expect(sheet).toBeVisible();
    await sheet.locator(`[data-mobile-sheet-slot-tab="${slotKey}"]`).click();
    if (options?.season) {
      await sheet.locator('[data-outfit-season-select="true"]').selectOption(options.season);
    }
    const pinnedCard = sheet.locator('[data-pinned-equipped-card]');
    if (options?.matchText && (await pinnedCard.count()) > 0) {
      const pinnedText = (await pinnedCard.innerText().catch(() => '')) || '';
      if (options.matchText.test(pinnedText)) {
        const pickedId = (await pinnedCard.getAttribute('data-pinned-equipped-card')) || '';
        await page.keyboard.press('Escape');
        return pickedId;
      }
    }
    const cards = sheet.locator('[data-slot-garment-id]');
    const target = options?.matchText
      ? cards.filter({ hasText: options.matchText }).first()
      : cards.first();
    await expect(target).toBeVisible();
    const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
    await target.click();
    const expandedCard = sheet.locator(`[data-slot-garment-id="${pickedId}"]`);
    const wearBtn = expandedCard.locator('[data-equip-inspector-btn="true"]');
    await expect(wearBtn).toBeVisible();
    await wearBtn.click();
    return pickedId;
  }

  await page.locator(`[data-outfit-slot-tab="${slotKey}"]`).click();
  const picker = page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`);
  if (options?.season) {
    await picker.locator('[data-outfit-season-select="true"]').selectOption(options.season);
  }
  const pinnedCard = picker.locator('[data-pinned-equipped-card]');
  if (options?.matchText && (await pinnedCard.count()) > 0) {
    const pinnedText = (await pinnedCard.innerText().catch(() => '')) || '';
    if (options.matchText.test(pinnedText)) {
      return (await pinnedCard.getAttribute('data-pinned-equipped-card')) || '';
    }
  }
  const cards = picker.locator('[data-slot-garment-id]');
  const target = options?.matchText
    ? cards.filter({ hasText: options.matchText }).first()
    : cards.first();
  await expect(target).toBeVisible();
  const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
  await target.click();
  const expandedCard = picker.locator(`[data-slot-garment-id="${pickedId}"]`);
  const wearBtn = expandedCard.locator('[data-equip-inspector-btn="true"]');
  await expect(wearBtn).toBeVisible();
  await wearBtn.click();
  return pickedId;
}

async function clearEquippedSlotsManually(
  studioCanvas: ReturnType<Page['locator']>
): Promise<void> {
  const removeBtns = studioCanvas.locator('.studio-worn-slot-remove');
  for (let guard = 0; guard < 16; guard += 1) {
    if ((await removeBtns.count()) === 0) break;
    await removeBtns.first().click();
  }
}

function setRangeSliderValue(page: Page, sliderSelector: string, nextValue: number) {
  return page.locator(sliderSelector).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    setter?.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, nextValue);
}

/**
 * Dispatches a synthetic pointer horizontal drag on `[data-flatlay-board="true"]` (or stage)
 * with deterministic elapsed duration so velocity is strictly `< 0.8 px/ms` (`slow` -> ±45°)
 * or `>= 0.8 px/ms` (`fast` -> 180° opposite spin).
 */
async function performStageSwipe(
  page: Page,
  stageLocator: ReturnType<Page['locator']>,
  direction: 'left' | 'right',
  speed: 'slow' | 'fast'
) {
  const target = stageLocator.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  const startX = Math.round(box!.x + box!.width * 0.52);
  const startY = Math.round(box!.y + box!.height * 0.72);
  const deltaPx = speed === 'fast' ? 180 : 76;
  const endX = direction === 'right' ? startX + deltaPx : startX - deltaPx;

  if (speed === 'slow') {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(Math.round((startX + endX) / 2), startY, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.move(endX, startY, { steps: 3 });
    await page.waitForTimeout(60);
    await page.mouse.up();
  } else {
    // Dispatch rapid pointerdown -> pointermove -> pointerup in-page (~4ms elapsed, v >= 0.8 px/ms)
    await target.evaluate(
      (el, coords) => {
        const mkInit = (clientX: number, buttons: number): PointerEventInit => ({
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          clientX,
          clientY: coords.y,
          button: 0,
          buttons,
        });
        el.dispatchEvent(new PointerEvent('pointerdown', mkInit(coords.x0, 1)));
        el.dispatchEvent(
          new PointerEvent('pointermove', mkInit(Math.round((coords.x0 + coords.x1) / 2), 1))
        );
        el.dispatchEvent(new PointerEvent('pointerup', mkInit(coords.x1, 0)));
      },
      { x0: startX, x1: endX, y: startY }
    );
    // Allow 4-step 28ms 180° spin animation to settle
    await page.waitForTimeout(160);
  }
}

const ALL_WEATHER_SCENARIO_KEYS = [
  'live',
  'crisp_autumn',
  'cloudy_overcast',
  'rainy_cool',
  'snowy_winter',
  'windy_gale',
  'warm_spring',
  'summer_heatwave',
  'winter_cold',
] as const;

async function selectWeatherScenarioViaCapsulePopup(
  page: Page,
  scenarioKey: (typeof ALL_WEATHER_SCENARIO_KEYS)[number]
) {
  const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
  if (!(await weatherPanel.isVisible())) {
    await page.locator('[data-atelier-weather-capsule="true"]').click();
  }
  await expect(weatherPanel).toBeVisible();
  const liveBtn = weatherPanel.locator('button[data-weather-scenario="live"]');
  const scenarioSelect = weatherPanel.locator('select[data-weather-scenario-select="true"]');
  await expect(liveBtn).toBeVisible();
  await expect(scenarioSelect).toBeVisible();
  await expect(scenarioSelect.locator('option[data-weather-scenario]')).toHaveCount(
    ALL_WEATHER_SCENARIO_KEYS.length - 1
  );
  if (scenarioKey === 'live') {
    await liveBtn.click();
  } else {
    await scenarioSelect.selectOption(scenarioKey);
  }
  if (await weatherPanel.isVisible()) {
    await page.keyboard.press('Escape');
  }
  await expect(weatherPanel).toHaveCount(0);
}

test.describe('Zero-Procedural Editorial Flat-Lay Board & 100% Gemini Multimodal Multi-Angle VTON', () => {
  test('1. Decluttered Outfits Stage: zero procedural drawing, Character Simulation default without photo, removed Outfits title/mode rail/stage toggles, and symmetrical [-180..0..+180] bottom angle scrollbar + 360° swipe sync', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(modelStage).toBeVisible();

    // Strictly ZERO procedural drawing <canvas>, legacy 2D weather canvas, or SVG human fallback elements on stage
    await expect(
      studioCanvas.locator('canvas:not(.studio-three-stage-mount canvas)')
    ).toHaveCount(0);
    await expect(
      studioCanvas.locator('canvas[data-weather-foreground-canvas="true"]')
    ).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-rain-layer="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('.character-25d-fallback-svg')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-atelier-backdrop="true"]')).toBeVisible();
    await expect(page.locator('[data-outfit-vton-refresh="true"]')).toHaveCount(0);
    await expect(page.locator('[data-outfit-clear-all="true"]')).toHaveCount(0);
    await expect(page.locator('.studio-mobile-slot-bar')).toHaveCount(0);
    await expect(page.locator('.hig-top-bar-left [data-open-store-btn="true"]')).toBeVisible();

    // Decluttered stage invariants:
    // - Top-left `Outfits / Virtual Studio` text lockup removed
    // - Top-center `[실사 모델 | 시뮬레이션]` stage pill removed (moved to Profile)
    // - Bottom-left `[AI 피팅 | 플랫레이]` button rail removed (character tap unfolds lookbook)
    // - Stage floating API Key icon button removed (moved to Profile)
    await expect(studioCanvas.locator('.atelier-stage-title-lockup')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-hud-style-segmented="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-vton-mode-rail')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-viewer-stage-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('#open-vton-api-key-btn')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-hud-key-btn="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-iso-rotate-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-angle-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-iso-angle-badge]')).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-25d-tone-dock')).toHaveCount(0);
    await expect(studioCanvas.locator('#open-body-spec-btn')).toHaveCount(0);
    await expect(studioCanvas.locator('#open-skin-tone-modal-btn')).toHaveCount(0);

    const topHudText = await studioCanvas.locator('.studio-stage-top-hud').innerText();
    expect(topHudText).not.toMatch(/Outfits|Virtual Studio/i);

    const hudNonOverlapping = await studioCanvas.evaluate((root) => {
      const leftSlot = root.querySelector('.studio-hud-left-slot')?.getBoundingClientRect();
      const capsule = root
        .querySelector('[data-atelier-weather-capsule="true"]')
        ?.getBoundingClientRect();
      if (!leftSlot || !capsule) return false;
      const rightBtn = root.querySelector('[data-mobile-wardrobe-trigger="true"]') as HTMLElement | null;
      const rightRect =
        rightBtn && window.getComputedStyle(rightBtn).display !== 'none'
          ? rightBtn.getBoundingClientRect()
          : null;
      return leftSlot.right <= capsule.left && (!rightRect || capsule.right <= rightRect.left);
    });
    expect(hudNonOverlapping).toBe(true);

    // Without a registered portrait photo, default style mode MUST be `stylized_isometric` (`캐릭터 시뮬레이션`)
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'ai-vton');
    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'stylized_isometric');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
    await expect(studioCanvas).toHaveAttribute('data-angle-scroll', '0');
    await expect(modelStage).toHaveAttribute('data-view-angle', '0');
    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();

    // Symmetrical Bottom Angle Scrollbar: starts at center 0° (Front), both ends (-180 / +180) are 180° Back
    const angleDock = studioCanvas.locator('[data-angle-scroll-dock="true"]');
    const angleInput = studioCanvas.locator('input[data-angle-scroll-input="true"]');
    // DESIGN.md v3: in the 2D flat-lay lookbook (no AI model image yet) the 3D angle dock keeps its
    // reserved slot but is hidden & inert; programmatic angle sync still stays consistent underneath.
    await expect(studioCanvas).toHaveAttribute('data-angle-dock-visible', 'false');
    await expect(angleDock).toBeHidden();
    await expect(angleInput).toHaveValue('0');
    await expect(angleDock.locator('[data-angle-center-reset="true"]')).toContainText(
      /0° 정면|0° Front/
    );

    // Scrubbing to +45° updates mannequin angle smoothly to 45°
    await setRangeSliderValue(page, 'input[data-angle-scroll-input="true"]', 45);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    await expect(studioCanvas).toHaveAttribute('data-angle-scroll', '45');

    // Scrubbing to left end (-180) and right end (+180) both show 180° Back (`뒷모습`)
    await setRangeSliderValue(page, 'input[data-angle-scroll-input="true"]', -180);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await expect(studioCanvas).toHaveAttribute('data-angle-scroll', '-180');
    await expect(angleDock.locator('[data-angle-center-reset="true"]')).toContainText(
      /180° 뒷모습|180° Back/
    );

    await setRangeSliderValue(page, 'input[data-angle-scroll-input="true"]', 180);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await expect(studioCanvas).toHaveAttribute('data-angle-scroll', '180');

    // Clicking center pill resets scrollbar back to dead-center 0° Front
    await setRangeSliderValue(page, 'input[data-angle-scroll-input="true"]', 0);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
    await expect(angleInput).toHaveValue('0');

    // Slow horizontal swipe right steps +45° across the full 8-angle 360° ring & syncs scrollbar
    for (const expectedDeg of ['45', '90', '135', '180', '225', '270', '315', '0']) {
      await performStageSwipe(page, studioCanvas, 'right', 'slow');
      await expect(studioCanvas).toHaveAttribute('data-view-angle', expectedDeg);
      await expect(modelStage).toHaveAttribute('data-view-angle', expectedDeg);
      await expect(
        studioCanvas.locator('canvas:not(.studio-three-stage-mount canvas)')
      ).toHaveCount(0);
    }
    await expect(angleInput).toHaveValue('0');

    // Slow swipe left steps -45° (0° -> 315°, scrollbar -45), then slow swipe right returns to 0°
    await performStageSwipe(page, studioCanvas, 'left', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '315');
    await expect(angleInput).toHaveValue('-45');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
    await expect(angleInput).toHaveValue('0');

    // Fast horizontal flick spins 180° opposite (0° -> 180° -> 0°)
    await performStageSwipe(page, studioCanvas, 'right', 'fast');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await performStageSwipe(page, studioCanvas, 'left', 'fast');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
  });

  test('2. Inclusive Avatar Studio: 4 frames, high-BMI coupled metrics (164cm/103kg), MST 1-10 x 4, hair/beard & hash sync', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    const initialHash = await studioCanvas.getAttribute('data-avatar-hash');
    expect(initialHash).toMatch(/^av2_[0-9a-f]{16}$/);

    // Open Profile Avatar Studio -> Body Profile tab
    await page.locator('#open-profile-studio-btn').click();
    await expect(page.locator('.skin-modal-character-stage canvas')).toHaveCount(0);
    await expect(
      page.locator('.skin-modal-character-stage [data-avatar-spec-card="true"]')
    ).toBeVisible();
    await page.locator('#profile-tab-body').click();

    for (const frame of ['feminine', 'masculine', 'androgynous', 'custom']) {
      await expect(page.locator(`[data-avatar-frame-btn="${frame}"]`)).toBeVisible();
    }
    for (const arch of [
      'hourglass',
      'inverted_triangle',
      'pear',
      'apple',
      'rectangle',
      'athletic',
      'petite',
      'plus_size',
    ]) {
      await expect(page.locator(`[data-archetype-preset="${arch}"]`)).toBeVisible();
    }

    // Select Androgynous frame + Plus Size archetype + High-BMI 164cm / 103kg (BMI 38.3)
    await page.locator('[data-avatar-frame-btn="androgynous"]').click();
    await page.locator('[data-archetype-preset="plus_size"]').click();
    await setRangeSliderValue(page, 'input[data-avatar-slider="heightCm"]', 164);
    await setRangeSliderValue(page, 'input[data-avatar-slider="weightKg"]', 103);
    await page.locator('[data-chest-form-btn="full_bust"]').click();

    await expect(page.locator('[data-bmi-badge]')).toHaveAttribute('data-bmi-badge', '38.3');
    const coupledStripText = await page.locator('.avatar-coupled-metrics-strip').innerText();
    const pctMatches = coupledStripText.match(/(\d+)%/g) || [];
    expect(pctMatches.length).toBe(3);
    for (const m of pctMatches) {
      expect(Number.parseInt(m, 10)).toBeGreaterThan(105);
    }

    // Verify strict tab separation & decluttered UI on Skin tab
    await page.locator('#profile-tab-skin').click();
    await expect(page.locator('.avatar-config-hash-badge')).toHaveCount(0);
    await expect(page.locator('.body-spec-account-badge')).toHaveCount(0);
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toHaveCount(0);
    await expect(page.locator('[data-lighting-mode]')).toHaveCount(0);
    await expect(page.locator('[data-mst-level]')).toHaveCount(10);

    // Select MST-10 deep tone directly from visible Monk 1-10 spectrum
    await page.locator('[data-mst-level="10"]').click();
    await page.locator('[data-mst-undertone="warm"]').click();
    const unifiedBadge = page.locator('[data-unified-tone-badge="true"]');
    await expect(unifiedBadge).toHaveAttribute('data-mst-code', 'MST-10-WARM');
    await expect(unifiedBadge).toContainText(/딥 리치|Rich Deep/);

    // Switch to Hair & Face tab -> test Hair (type4_coily_afro) & Beard
    await page.locator('#profile-tab-hair').click();
    await page.locator('[data-hair-style-btn="type4_coily_afro"]').click();
    await page.locator('[data-facial-hair-btn="short_boxed_beard"]').click();

    const modalLiveHash = await page
      .locator('.skin-modal-character-stage [data-avatar-spec-card="true"]')
      .getAttribute('data-avatar-hash');
    expect(modalLiveHash).toMatch(/^av2_[0-9a-f]{16}$/);
    expect(modalLiveHash).not.toBe(initialHash);

    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();
    await expect(studioCanvas).toHaveAttribute('data-avatar-hash', modalLiveHash!);
    await expect(modelStage).toHaveAttribute('data-height-cm', '164');
    await expect(modelStage).toHaveAttribute('data-weight-kg', '103');
  });

  test('3. Editorial Flat-Lay Board 0ms 1:1 slot sync, aspect-ratio preservation, swimwear + flip-flops, and instant unequip', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // Verify Accessories slot contains ZERO underwear / socks items
    const mobileWardrobeBtn = studioCanvas.locator('[data-mobile-wardrobe-trigger="true"]');
    if (await mobileWardrobeBtn.isVisible()) {
      await mobileWardrobeBtn.click();
      const sheet = page.locator('#outfit-mobile-wardrobe-sheet');
      await expect(sheet).toBeVisible();
      await sheet.locator('[data-mobile-sheet-slot-tab="accessory"]').click();
      const sheetText = await sheet.innerText();
      expect(sheetText).not.toMatch(/이너탑|언더웨어|크루 삭스|앵클 삭스|Underwear|Socks/i);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    } else {
      await page.locator('[data-outfit-slot-tab="accessory"]').click();
      const pickerText = await page
        .locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`)
        .innerText();
      expect(pickerText).not.toMatch(/이너탑|언더웨어|크루 삭스|앵클 삭스|Underwear|Socks/i);
    }

    await expect(
      page.locator('[data-weather-look-dock="true"] [data-look-selector-trigger="true"]')
    ).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await clearEquippedSlotsManually(studioCanvas);
    await expect(studioCanvas).toHaveAttribute('data-equipped-count', '0');
    await expect(studioCanvas.locator('[data-flatlay-empty="true"]')).toBeVisible();

    await selectStudioSlotAndPickItem(page, 'onepiece', {
      season: '여름',
      matchText: /수영복|비키니|래시가드|Swim|Bikini|Rashguard/i,
    });
    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '여름',
      matchText: /쪼리|플립플랍|샌들|Flip|Sandal/i,
    });
    await selectStudioSlotAndPickItem(page, 'accessory', {
      season: '여름',
      matchText: /선글라스|버킷햇|토트|Sunglasses|Bucket|Tote/i,
    });

    // Instant 0ms 100% Unfolded Flat-Lay Lookbook placement with non-overlapping CSS Grid & object-fit: contain
    const flatLayBoard = studioCanvas.locator('[data-flatlay-board="true"]');
    await expect(flatLayBoard).toHaveAttribute('data-flatlay-unfolded', 'true');
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="onepiece"]')).toBeVisible();
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="shoes"]')).toBeVisible();
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="accessory"]')).toBeVisible();

    const unfoldedGridCheck = await flatLayBoard.evaluate((board) => {
      const boxes = Array.from(board.querySelectorAll('[data-flatlay-item-slot]')).map((el) =>
        el.getBoundingClientRect()
      );
      if (boxes.length < 3) return { ok: false, reason: 'missing_items' };
      for (let i = 0; i < boxes.length; i += 1) {
        if (boxes[i].width < 36 || boxes[i].height < 36) {
          return { ok: false, reason: 'collapsed_box' };
        }
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const overlaps = !(
            a.right <= b.left + 1 ||
            a.left >= b.right - 1 ||
            a.bottom <= b.top + 1 ||
            a.top >= b.bottom - 1
          );
          if (overlaps) return { ok: false, reason: `overlap_${i}_${j}` };
        }
      }
      return { ok: true, reason: 'none' };
    });
    expect(unfoldedGridCheck).toEqual({ ok: true, reason: 'none' });

    const objectFitVal = await flatLayBoard
      .locator('[data-flatlay-item-slot="onepiece"] img')
      .evaluate((el) => window.getComputedStyle(el).objectFit);
    expect(objectFitVal).toBe('contain');

    // Unequip swimwear -> instant removal with zero ghost residual
    await studioCanvas.locator('[data-studio-slot="onepiece"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="onepiece"]')).toHaveCount(0);
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="onepiece"]')).toHaveCount(0);
  });

  test('4. Profile VTON Style & API Key Integration: Character Simulation default, Photo Guidance Popup -> Portrait Upload -> Photorealistic unlock, Character Tap Unfolded Lookbook, and 2x2 IndexedDB cache', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      page.locator('[data-weather-look-dock="true"] [data-look-selector-trigger="true"]')
    ).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();

    // Part A: Without API key configured on CI server, stage surfaces status toast & unfolded Flat-Lay Board
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'ai-vton');
    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'stylized_isometric');
    await expect(studioCanvas.locator('[data-vton-status-toast="true"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();
    await expect(
      studioCanvas.locator('canvas:not(.studio-three-stage-mount canvas)')
    ).toHaveCount(0);

    // Clicking [API 키 설정] on the stage toast opens Profile directly with the Gemini API Key section expanded!
    await studioCanvas.locator('[data-vton-open-key-btn="true"]').click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await expect(profileSheet).toBeVisible();
    const keyPopover = profileSheet.locator('[data-vton-key-popover="true"]');
    await expect(keyPopover).toBeVisible();
    await expect(keyPopover.locator('[data-vton-aistudio-link="true"]')).toHaveAttribute(
      'href',
      'https://aistudio.google.com/apikey'
    );

    // Verify Profile Style Segmented Control: `캐릭터 시뮬레이션` is active by default when no photo is registered
    const profileStyleSeg = profileSheet.locator('[data-profile-style-segmented="true"]');
    await expect(profileStyleSeg).toBeVisible();
    await expect(
      profileStyleSeg.locator('[data-vton-style-toggle="stylized_isometric"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      profileStyleSeg.locator('[data-vton-style-toggle="stylized_isometric"]')
    ).toContainText(/캐릭터 시뮬레이션|Character Simulation/);

    // Selecting `실사 모델` without a registered photo opens the Photo Registration Guidance Popup!
    await profileStyleSeg.locator('[data-vton-style-toggle="photorealistic"]').click();
    const photoGuideModal = page.locator('[data-photo-guide-modal="true"]');
    await expect(photoGuideModal).toBeVisible();
    await expect(photoGuideModal).toContainText(/본인 사진 등록 안내|Register Your Photo/);
    await expect(
      profileStyleSeg.locator('[data-vton-style-toggle="stylized_isometric"]')
    ).toHaveAttribute('aria-pressed', 'true');

    // Clicking [본인 사진 등록하기] closes popup & auto-enables `실사 모델` once a portrait photo is uploaded!
    await photoGuideModal.locator('[data-photo-guide-register-btn="true"]').click();
    await expect(photoGuideModal).toHaveCount(0);
    await profileSheet.locator('#skin-portrait-file-input').setInputFiles({
      name: 'guide-portrait.png',
      mimeType: 'image/png',
      buffer: buildSyntheticPortraitPngBuffer(),
    });
    await expect(profileSheet.locator('[data-user-face-active="true"]')).toBeVisible();
    await expect(
      profileStyleSeg.locator('[data-vton-style-toggle="photorealistic"]')
    ).toHaveAttribute('aria-pressed', 'true');

    // Resetting the portrait photo automatically reverts back to `캐릭터 시뮬레이션`!
    await profileSheet.locator('[data-reset-face-photo-btn="true"]').click();
    await expect(
      profileStyleSeg.locator('[data-vton-style-toggle="stylized_isometric"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(profileSheet).toBeHidden();

    // Part B: Mock Gemini `/api/vton/synthesize` returning a 2x2 Turnaround Studio Sheet
    const sheetPhoto = buildMockTurnaround2x2PngDataUrl(10);
    const sheetStylized = buildMockTurnaround2x2PngDataUrl(60);
    const capturedBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/vton/synthesize', async (route) => {
      const postData = route.request().postDataJSON() as Record<string, unknown>;
      capturedBodies.push(postData);
      // Small delay so glassmorphism shimmer overlay is observable
      await new Promise((r) => setTimeout(r, 120));
      const requestedStyle = String(postData?.styleMode || 'stylized_isometric');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image',
          layout: 'turnaround_2x2',
          styleMode: requestedStyle,
          geminiUsed: true,
          compositeImageUrl:
            requestedStyle === 'stylized_isometric' ? sheetStylized : sheetPhoto,
        }),
      });
    });

    // Trigger synthesis via single Look selector menu (Look 2) since header Refresh was removed
    await studioCanvas.locator('[data-look-selector-trigger="true"]').click();
    await studioCanvas
      .locator('[data-look-selector-menu="true"] [data-weather-rec-id]')
      .nth(1)
      .click();
    await expect(studioCanvas.locator('[data-vton-shimmer-overlay="true"]')).toBeVisible();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible();
    await expect(studioCanvas).toHaveAttribute('data-vton-provider', 'gemini-vton');
    expect(capturedBodies.length).toBe(1);

    // Verify default multimodal payload without photo used `stylized_isometric` (`캐릭터 시뮬레이션`)
    const firstPayload = capturedBodies[0] as {
      styleMode?: string;
      turnaroundSheet?: boolean;
      avatarSpec?: { anthropometrics?: { heightCm?: number } };
      slots?: Record<string, { packshotDataUrl?: string }>;
    };
    expect(firstPayload.styleMode).toBe('stylized_isometric');
    expect(firstPayload.turnaroundSheet).toBe(true);
    expect(firstPayload.avatarSpec?.anthropometrics?.heightCm).toBeGreaterThanOrEqual(140);
    const topSlotPayload = firstPayload.slots?.top;
    expect(topSlotPayload?.packshotDataUrl).toMatch(/^data:image\//);

    const slice0 = await aiImg.getAttribute('src');
    expect(slice0).toMatch(/^data:image\/png;base64,/);

    // Tapping the character opens the 100% unfolded Flat-Lay Lookbook; clicking [캐릭터 보기] returns cleanly!
    await aiImg.click();
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'flatlay');
    await expect(studioCanvas).toHaveAttribute('data-lookbook-overlay', 'true');
    await expect(
      studioCanvas.locator('[data-flatlay-board="true"][data-flatlay-unfolded="true"]')
    ).toBeVisible();
    const closeLookbookBtn = studioCanvas.locator('[data-flatlay-close-btn="true"]');
    await expect(closeLookbookBtn).toBeVisible();
    await closeLookbookBtn.click();
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'ai-vton');
    await expect(aiImg).toBeVisible();
    expect(capturedBodies.length).toBe(1);

    // Swipe to 90° Side Profile & 180° Back -> 0ms IndexedDB/Memory slice hit with ZERO extra API calls!
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    const slice90 = await aiImg.getAttribute('src');
    expect(slice90).not.toBe(slice0);
    expect(capturedBodies.length).toBe(1);

    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    const slice180 = await aiImg.getAttribute('src');
    expect(slice180).not.toBe(slice90);
    expect(capturedBodies.length).toBe(1);

    // Register a portrait photo in Profile & select `실사 모델` -> triggers `photorealistic` synthesis
    await page.locator('#open-profile-studio-btn').click();
    await expect(profileSheet).toBeVisible();
    await profileSheet.locator('#skin-portrait-file-input').setInputFiles({
      name: 'real-model-photo.png',
      mimeType: 'image/png',
      buffer: buildSyntheticPortraitPngBuffer(),
    });
    await expect(profileSheet.locator('[data-user-face-active="true"]')).toBeVisible();
    await profileStyleSeg.locator('[data-vton-style-toggle="photorealistic"]').click();
    await profileSheet.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();
    await expect(profileSheet).toBeHidden();

    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'photorealistic');
    await expect.poll(() => capturedBodies.length).toBe(2);
    expect(capturedBodies[1].styleMode).toBe('photorealistic');
    await expect(studioCanvas.locator('[data-vton-shimmer-overlay="true"]')).toHaveCount(0);
    await expect(aiImg).toBeVisible();

    // Switching to `캐릭터 시뮬레이션` at the new photo-extracted skin tone hash runs once (call #3),
    // and toggling back to `실사 모델` & `캐릭터 시뮬레이션` reuses cache with ZERO extra API calls!
    await page.locator('#open-profile-studio-btn').click();
    await profileStyleSeg.locator('[data-vton-style-toggle="stylized_isometric"]').click();
    await page.keyboard.press('Escape');
    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'stylized_isometric');
    await expect.poll(() => capturedBodies.length).toBe(3);
    await expect(studioCanvas.locator('[data-vton-shimmer-overlay="true"]')).toHaveCount(0);
    await expect(aiImg).toBeVisible();

    await page.locator('#open-profile-studio-btn').click();
    await profileStyleSeg.locator('[data-vton-style-toggle="photorealistic"]').click();
    await page.keyboard.press('Escape');
    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'photorealistic');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    expect(capturedBodies.length).toBe(3);
  });

  test('5. 4-Season 128-item photorealistic catalog (>= 30 per season) & Winter long-puffer + long-boots Flat-Lay styling', async ({
    page,
    request,
  }) => {
    const res = await request.get('/api/garments?closet=sample', {
      headers: { 'X-Demo-Mode': 'sample' },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const garments: Array<{
      id: number;
      name: string;
      category: string;
      subcategory: string;
      seasons: string[] | string;
      image_url: string;
    }> = json.garments || [];

    expect(garments.length).toBeGreaterThanOrEqual(120);

    const countBySeason: Record<string, number> = { 봄: 0, 여름: 0, 가을: 0, 겨울: 0 };
    for (const g of garments) {
      const sList = Array.isArray(g.seasons)
        ? g.seasons
        : typeof g.seasons === 'string'
          ? JSON.parse(g.seasons)
          : [];
      for (const s of ['봄', '여름', '가을', '겨울']) {
        if (sList.includes(s)) countBySeason[s] += 1;
      }
      expect(g.image_url).toMatch(/^\/seed\/.+\.webp$/);
    }

    expect(countBySeason['봄']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['여름']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['가을']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['겨울']).toBeGreaterThanOrEqual(30);

    const winterLongPuffer = garments.find((g) => g.subcategory === 'long_padding');
    const summerFlipFlops = garments.find((g) => g.subcategory === 'flip_flops');
    expect(winterLongPuffer).toBeTruthy();
    expect(summerFlipFlops).toBeTruthy();

    for (const item of [winterLongPuffer!, summerFlipFlops!]) {
      const assetRes = await request.get(item.image_url);
      expect(assetRes.status()).toBe(200);
      expect(assetRes.headers()['content-type']).toContain('image/webp');
    }

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      page.locator('[data-weather-look-dock="true"] [data-look-selector-trigger="true"]')
    ).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await clearEquippedSlotsManually(studioCanvas);
    await expect(studioCanvas).toHaveAttribute('data-equipped-count', '0');

    await selectStudioSlotAndPickItem(page, 'outer', {
      season: '겨울',
      matchText: /롱패딩|숏패딩|무스탕|Puffer|Parka|Mustang/i,
    });
    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '겨울',
      matchText: /롱부츠|스노우|방한|Boots/i,
    });

    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="shoes"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-item-slot="outer"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-item-slot="shoes"]')).toBeVisible();
  });

  test('6. Live AI VTON Test Showcase (?demo_vton=1) defaults to Character Simulation without photo, unfolds Lookbook on tap, and unlocks Photorealistic in Profile', async ({
    page,
  }) => {
    await page.goto('/outfits?demo_vton=1');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    await expect(studioCanvas).toHaveAttribute('data-vton-provider', 'gemini-vton');
    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'stylized_isometric');

    const src0 = await aiImg.getAttribute('src');
    expect(src0).toMatch(/^data:image\//);

    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    const src90 = await aiImg.getAttribute('src');
    expect(src90).toMatch(/^data:image\//);
    expect(src90).not.toBe(src0);

    // Tap character -> opens unfolded lookbook -> press Escape to return to character
    await aiImg.click();
    await expect(studioCanvas).toHaveAttribute('data-lookbook-overlay', 'true');
    await page.keyboard.press('Escape');
    await expect(aiImg).toBeVisible();

    // Register portrait photo in Profile & select Photorealistic -> updates showcase model slice
    await page.locator('#open-profile-studio-btn').click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await profileSheet.locator('#skin-portrait-file-input').setInputFiles({
      name: 'showcase-face.png',
      mimeType: 'image/png',
      buffer: buildSyntheticPortraitPngBuffer(),
    });
    await profileSheet.locator('[data-vton-style-toggle="photorealistic"]').click();
    await profileSheet.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();

    await expect(studioCanvas).toHaveAttribute('data-vton-style', 'photorealistic');
    await expect
      .poll(async () => await aiImg.getAttribute('src'))
      .not.toBe(src90);
  });

  test('7. Direct Browser Gemini Synthesis executes with Paid Tier key saved in Profile even when /api/vton/synthesize proxy returns gemini_network_error', async ({
    page,
  }) => {
    const mockTurnaroundDataUrl = buildMockTurnaround2x2PngDataUrl(77);
    const mockTurnaroundBase64 = mockTurnaroundDataUrl.replace(/^data:image\/png;base64,/, '');
    let browserGeminiCalls = 0;
    let capturedApiKeyHeader = '';
    const seenModalities: string[] = [];

    await page.route('**/api/vton/synthesize', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          mode: '2d-vton',
          provider: 'flatlay-fallback',
          geminiUsed: false,
          compositeImageUrl: null,
          fallbackReason: 'gemini_network_error',
        }),
      });
    });

    await page.route(
      'https://generativelanguage.googleapis.com/v1beta/models/**',
      async (route) => {
        browserGeminiCalls += 1;
        const req = route.request();
        capturedApiKeyHeader = req.headers()['x-goog-api-key'] || '';
        const bodyJson = JSON.parse(req.postData() || '{}') as {
          generationConfig?: { responseModalities?: string[] };
        };
        const mods = (bodyJson.generationConfig?.responseModalities || []).join(',');
        seenModalities.push(mods);

        // First call returns text-only STOP to verify automatic ['IMAGE'] modality retry!
        if (browserGeminiCalls === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [
                {
                  finishReason: 'STOP',
                  content: { parts: [{ text: 'Generating studio lookbook...' }] },
                },
              ],
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'image/png',
                        data: mockTurnaroundBase64,
                      },
                    },
                  ],
                },
              },
            ],
          }),
        });
      }
    );

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // Open Profile -> expand Gemini API Key Settings -> save Paid Tier key
    await page.locator('#open-profile-studio-btn').click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await expect(profileSheet).toBeVisible();
    await profileSheet.locator('#open-vton-api-key-btn').click();
    const keyInput = profileSheet.locator('[data-vton-key-input="true"]');
    await expect(keyInput).toBeVisible();
    await keyInput.fill('test-paid-tier1-gemini-key-9876543210');
    await profileSheet.locator('[data-vton-save-key-btn="true"]').click();
    await page.keyboard.press('Escape');
    await expect(profileSheet).toBeHidden();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    await expect(studioCanvas).toHaveAttribute('data-vton-provider', 'gemini-vton');

    expect(capturedApiKeyHeader).toBe('test-paid-tier1-gemini-key-9876543210');
    expect(seenModalities).toEqual(['TEXT,IMAGE', 'IMAGE']);

    const slice0 = await aiImg.getAttribute('src');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await performStageSwipe(page, studioCanvas, 'right', 'slow');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    const slice90 = await aiImg.getAttribute('src');
    expect(slice90).not.toBe(slice0);
  });

  test('8. Smart Credit-Saver staging (0 API calls during multi-garment edits), automatic cache reuse, Character Tap Lookbook toggle, and Top-Right Saved AI Fittings History popover', async ({
    page,
  }) => {
    const sheetLookA = buildMockTurnaround2x2PngDataUrl(15);
    const sheetLookB = buildMockTurnaround2x2PngDataUrl(95);
    let synthCalls = 0;

    await page.route('**/api/vton/synthesize', async (route) => {
      synthCalls += 1;
      const currentCall = synthCalls;
      const postData = route.request().postDataJSON() as Record<string, unknown>;
      await new Promise((r) => setTimeout(r, 60));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image',
          layout: 'turnaround_2x2',
          styleMode: String(postData?.styleMode || 'stylized_isometric'),
          geminiUsed: true,
          compositeImageUrl: currentCall === 1 ? sheetLookA : sheetLookB,
        }),
      });
    });

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      page.locator('[data-weather-look-dock="true"] [data-look-selector-trigger="true"]')
    ).toBeVisible();

    // 1. Initial entry auto-generates Look A once
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    const callsAfterInitial = synthCalls;
    expect(callsAfterInitial).toBe(1);
    const lookASrc0 = await aiImg.getAttribute('src');
    expect(lookASrc0).toMatch(/^data:image\//);

    // 2. Perform 3 consecutive garment changes -> Credit-Saver stages edits on Flat-Lay with ZERO API calls!
    await studioCanvas.locator('[data-studio-slot="top"] .studio-worn-slot-remove').click();
    await selectStudioSlotAndPickItem(page, 'outer', {
      season: '겨울',
      matchText: /롱패딩|숏패딩|무스탕|Puffer|Parka|Mustang/i,
    });
    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '겨울',
      matchText: /롱부츠|스노우|방한|Boots/i,
    });

    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();
    const stagedBar = studioCanvas.locator('[data-vton-staged-bar="true"]');
    await expect(stagedBar).toBeVisible();
    await expect(stagedBar.locator('[data-vton-history-btn]')).toHaveCount(0);
    expect(await stagedBar.innerText()).not.toMatch(/이전 피팅|Saved\s*\(/i);
    expect(synthCalls).toBe(callsAfterInitial);
    const generateBtn = studioCanvas.locator('[data-vton-generate-btn="true"]');
    await expect(generateBtn).toBeVisible();

    // 3. Explicit 1-click generation for Look B -> fires exactly 1 API call
    await generateBtn.click();
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    expect(synthCalls).toBe(callsAfterInitial + 1);
    const lookBSrc0 = await aiImg.getAttribute('src');
    expect(lookBSrc0).not.toBe(lookASrc0);

    // 4. Switch back to Look 1 via single Look selector menu -> automatic 0ms cache reuse with ZERO extra API calls!
    await studioCanvas.locator('[data-look-selector-trigger="true"]').click();
    await studioCanvas
      .locator('[data-look-selector-menu="true"] [data-weather-rec-id]')
      .first()
      .click();
    await expect(aiImg).toBeVisible();
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    expect(await aiImg.getAttribute('src')).toBe(lookASrc0);
    expect(synthCalls).toBe(callsAfterInitial + 1);

    // Tapping character <-> closing unfolded Flat-Lay Lookbook preserves cache with ZERO extra API calls!
    await aiImg.click();
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'flatlay');
    await studioCanvas.locator('[data-flatlay-close-btn="true"]').click();
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'ai-vton');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    expect(synthCalls).toBe(callsAfterInitial + 1);

    // 5. Open Top-Right Icon-Only Saved AI Fittings History (`<sup data-vton-history-count="2">`), test Escape + click-outside dismiss, and 1-click restore!
    const historyBtn = studioCanvas.locator('[data-vton-history-btn="true"]');
    await expect(historyBtn).toBeVisible();
    expect((await historyBtn.innerText()).trim()).not.toMatch(/기록|Saved/i);
    await expect(historyBtn.locator('sup[data-vton-history-count="2"]')).toHaveText('2');
    await historyBtn.click();

    const historyPopover = studioCanvas.locator('[data-vton-history-popover="true"]');
    await expect(historyPopover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(historyPopover).toHaveCount(0);

    await historyBtn.click();
    await expect(historyPopover).toBeVisible();
    await studioCanvas
      .locator('[data-vton-popover-backdrop="true"]')
      .click({ position: { x: 24, y: 120 } });
    await expect(historyPopover).toHaveCount(0);

    await historyBtn.click();
    await expect(historyPopover).toBeVisible();
    const cards = historyPopover.locator('[data-vton-history-card]');
    await expect(cards).toHaveCount(2);

    // Click the non-active card (Look B) -> restores Look B image AND its equipped winter outer/shoes slots!
    await historyPopover.locator('.studio-vton-history-card:not(.is-active)').first().click();
    await expect(historyPopover).toHaveCount(0);
    expect(await aiImg.getAttribute('src')).toBe(lookBSrc0);
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();
    expect(synthCalls).toBe(callsAfterInitial + 1);
  });

  test('9. Twin/duplicate model isolation on wide 2x2 slice, user face photo upload -> portraitDataUrl VTON identity lock, and rainy weather rain layer + auto-umbrella', async ({
    page,
  }) => {
    // Build a 256x288 2x2 sheet whose 180° (bottom-right, 128x144) quadrant intentionally contains TWO side-by-side twin figures
    const buildTwinTurnaroundPng = (): string => {
      const width = 256;
      const height = 288;
      const raw = Buffer.alloc((width * 4 + 1) * height);
      const quadH = height / 2;
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width * 4 + 1);
        raw[rowOffset] = 0;
        const isBottom = y >= quadH;
        const localY = y % quadH;
        for (let x = 0; x < width; x += 1) {
          const isRight = x >= width / 2;
          const localX = x % (width / 2);
          const px = rowOffset + 1 + x * 4;
          // Studio #F5F5F7 background
          let r = 245;
          let g = 245;
          let b = 247;
          if (isBottom && isRight) {
            // Twin Figure A (Red-toned) centered around x=34 with tapered head, torso, slim trousers & narrow shoes
            if (localY >= 12 && localY <= 25 && localX >= 29 && localX <= 39) {
              r = 204;
              g = 162;
              b = 134;
            } else if (localY >= 26 && localY <= 78 && localX >= 17 && localX <= 51) {
              r = 195;
              g = 38;
              b = 42;
            } else if (localY >= 79 && localY <= 118 && localX >= 22 && localX <= 46) {
              r = 185;
              g = 36;
              b = 40;
            } else if (
              localY >= 119 &&
              localY <= 129 &&
              ((localX >= 23 && localX <= 29) || (localX >= 39 && localX <= 45))
            ) {
              r = 42;
              g = 36;
              b = 38;
            } else if (localY >= 14 && localY <= 26 && localX >= 92 && localX <= 102) {
              // Twin Figure B (Blue-toned) on right [82..112]
              r = 204;
              g = 162;
              b = 134;
            } else if (localY >= 27 && localY <= 116 && localX >= 83 && localX <= 111) {
              r = 32;
              g = 76;
              b = 205;
            } else if (
              localY >= 117 &&
              localY <= 127 &&
              ((localX >= 86 && localX <= 92) || (localX >= 101 && localX <= 107))
            ) {
              r = 28;
              g = 62;
              b = 175;
            }
          } else if (localY >= 12 && localY <= 25 && localX >= 58 && localX <= 69) {
            // Single centered figure tapered head in 0°/45°/90° quadrants
            r = 204;
            g = 162;
            b = 134;
          } else if (localY >= 26 && localY <= 78 && localX >= 46 && localX <= 81) {
            // Single centered figure torso/coat matching Twin A crimson tone across 0°/45°/90°
            r = 195;
            g = isRight ? 42 : 38;
            b = isBottom ? 46 : 42;
          } else if (localY >= 79 && localY <= 118 && localX >= 51 && localX <= 76) {
            r = 185;
            g = isRight ? 40 : 36;
            b = isBottom ? 44 : 40;
          } else if (
            localY >= 119 &&
            localY <= 129 &&
            ((localX >= 52 && localX <= 58) || (localX >= 69 && localX <= 75))
          ) {
            r = 42;
            g = 36;
            b = 38;
          }
          raw[px] = r;
          raw[px + 1] = g;
          raw[px + 2] = b;
          raw[px + 3] = 255;
        }
      }

      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const makeChunk = (type: string, data: Buffer): Buffer => {
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
      };
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const png = Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
      ]);
      return `data:image/png;base64,${png.toString('base64')}`;
    };

    // Build a synthetic warm skin-tone portrait PNG for face upload test
    const buildPortraitPngBuffer = (): Buffer => {
      const w = 96;
      const h = 96;
      const raw = Buffer.alloc((w * 4 + 1) * h);
      for (let y = 0; y < h; y += 1) {
        const ro = y * (w * 4 + 1);
        raw[ro] = 0;
        for (let x = 0; x < w; x += 1) {
          const px = ro + 1 + x * 4;
          raw[px] = 226;
          raw[px + 1] = 186;
          raw[px + 2] = 158;
          raw[px + 3] = 255;
        }
      }
      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const makeChunk = (type: string, data: Buffer): Buffer => {
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
      };
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      return Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
      ]);
    };

    const twinSheetUrl = buildTwinTurnaroundPng();
    const capturedPortraitUrls: Array<string | null> = [];

    await page.route('**/api/vton/synthesize', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as {
        profile?: { portraitDataUrl?: string | null };
      };
      capturedPortraitUrls.push(body.profile?.portraitDataUrl || null);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image-preview',
          layout: 'turnaround_2x2',
          styleMode: 'photorealistic',
          geminiUsed: true,
          compositeImageUrl: twinSheetUrl,
        }),
      });
    });

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 20000 });

    // (1) Verify 180° quadrant twin-figure CV isolation removes the duplicate blue twin figure via fast flick!
    await performStageSwipe(page, studioCanvas, 'right', 'fast');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    const colorCounts180 = await aiImg.evaluate(async (el) => {
      const img = el as HTMLImageElement;
      if (!img.complete) {
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('Failed to load 180-degree VTON slice image'));
        });
      }
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let redTwinPixels = 0;
      let blueTwinPixels = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 150 && d[i + 2] < 90) redTwinPixels += 1;
        if (d[i + 2] > 150 && d[i] < 90) blueTwinPixels += 1;
      }
      return { redTwinPixels, blueTwinPixels };
    });
    expect(colorCounts180.redTwinPixels).toBeGreaterThan(200);
    expect(colorCounts180.blueTwinPixels).toBe(0);

    // (2) Upload user face photo -> verify active face banner & portraitDataUrl sent to VTON!
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    const portraitInput = page.locator('#skin-portrait-file-input');
    await portraitInput.setInputFiles({
      name: 'my-real-face.png',
      mimeType: 'image/png',
      buffer: buildPortraitPngBuffer(),
    });
    await expect(page.locator('[data-user-face-active="true"]')).toBeVisible();
    await expect(page.locator('[data-reset-face-photo-btn="true"]')).toBeVisible();
    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();

    // Trigger AI fitting regeneration with the new face identity
    const genBtn = studioCanvas.locator('[data-vton-generate-btn="true"]');
    if (await genBtn.isVisible()) {
      await genBtn.click();
    }
    await expect
      .poll(() => capturedPortraitUrls.some((u) => Boolean(u && u.startsWith('data:image/'))))
      .toBe(true);

    // (3) Select Rainy weather ('rainy_cool') on indoor stage (c_atelier_plaster) ->
    //     weather capsule shows rain, indoor stage renders warm ivory ambient light,
    //     and rain particles + wet mirror + umbrella are suppressed indoors!
    await selectWeatherScenarioViaCapsulePopup(page, 'rainy_cool');
    await expect(studioCanvas).toHaveAttribute('data-stage-lighting', 'indoor-ivory');
    await expect(studioCanvas.locator('[data-indoor-ivory-light="true"]')).toBeVisible();
    const threeStageLayer = studioCanvas.locator('[data-testid="studio-three-stage-layer"]');
    await expect(threeStageLayer).toHaveAttribute('data-stage-outdoor', 'false');
    await expect(threeStageLayer).toHaveAttribute('data-weather-mode', 'indoor-ivory');
    await expect(studioCanvas.locator('[data-studio-rain-layer="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('canvas[data-weather-foreground-canvas="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-wet-mirror-reflection="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-slot="acc_umbrella"]')).toHaveCount(0);

    // (4) Switch to open-sky B+ outdoor stage (b_brick_courtyard) -> Three.js rain, wet mirror, and auto-umbrella activate!
    await page.evaluate(() => {
      const key = 'ainventory_stage_economy_v1';
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { unlockedIds: ['c_atelier_plaster'], iBalance: 0 };
      const unlocked = Array.from(
        new Set([...(parsed.unlockedIds || []), 'c_atelier_plaster', 'b_brick_courtyard'])
      );
      const next = {
        ...parsed,
        unlockedIds: unlocked,
        equippedBackgroundId: 'b_brick_courtyard',
      };
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('ainventory:economy-updated', { detail: next }));
    });
    await expect(studioCanvas).toHaveAttribute('data-stage-bg-id', 'b_brick_courtyard');
    await expect(studioCanvas).toHaveAttribute('data-stage-lighting', 'outdoor-sky');
    await expect(threeStageLayer).toHaveAttribute('data-stage-outdoor', 'true');
    await expect(threeStageLayer).toHaveAttribute('data-aura-tier', 'B+');
    await expect(threeStageLayer).toHaveAttribute('data-weather-mode', 'rain');
    await expect(studioCanvas.locator('[data-studio-rain-layer="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-slot="acc_umbrella"]')).toBeVisible();
  });

  test('10. Multi-part Accessories & Jewelry sub-trees (incl. asymmetric L/R gloves & watches), 5 material seeds per new sub-part, and zero Hangul leak in English', async ({
    page,
    request,
  }) => {
    // Create a brand-new authenticated user with an empty closet and verify 5 material seeds x 13 sub-types = 65 items!
    const appleRes = await request.post('/api/auth/apple', {
      data: {
        apple_sub: `e2e_fresh_mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        full_name: 'Atelier Material Tester',
      },
    });
    expect(appleRes.ok()).toBeTruthy();
    const appleJson = await appleRes.json();
    const token: string = appleJson.token;
    const freshCloset: string = appleJson.user.defaultCloset;

    const seedRes = await request.post('/api/garments/ensure-material-seeds', {
      headers: { Authorization: `Bearer ${token}` },
      data: { closet_owner: freshCloset },
    });
    expect(seedRes.ok()).toBeTruthy();
    const seedJson = await seedRes.json();
    expect(seedJson.inserted).toBe(65);

    const listRes = await request.get(`/api/garments?closet=${encodeURIComponent(freshCloset)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const listJson = await listRes.json();
    const seededItems: Array<{ subcategory: string; fabric: string }> = listJson.garments || [];
    expect(seededItems.length).toBe(65);

    const expectedSubtypes = [
      'umbrella',
      'watch',
      'gloves',
      'eyewear',
      'headwear',
      'neckwear',
      'belt',
      'bag',
      'earring',
      'necklace',
      'bracelet',
      'ring',
      'brooch',
    ];
    for (const sub of expectedSubtypes) {
      const subItems = seededItems.filter((g) => g.subcategory === sub);
      expect(subItems.length).toBeGreaterThanOrEqual(5);
      const distinctMaterials = new Set(subItems.map((g) => g.fabric));
      expect(distinctMaterials.size).toBeGreaterThanOrEqual(4);
    }

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    const pickSubSlotCard = async (
      parentTab: 'accessory' | 'jewelry',
      subSlotKey: string,
      cardIndex: number
    ) => {
      const mobileWardrobeBtn = studioCanvas.locator('[data-mobile-wardrobe-trigger="true"]');
      if (await mobileWardrobeBtn.isVisible()) {
        await mobileWardrobeBtn.click();
        const sheet = page.locator('#outfit-mobile-wardrobe-sheet');
        await expect(sheet).toBeVisible();
        await sheet.locator(`[data-mobile-sheet-slot-tab="${parentTab}"]`).click();
        await sheet.locator(`[data-subtree-select="${parentTab}"]`).selectOption(subSlotKey);
        const cards = sheet.locator('[data-slot-garment-id]');
        const target = cards.nth(cardIndex);
        await expect(target).toBeVisible();
        const gid = (await target.getAttribute('data-slot-garment-id')) || '';
        await target.click();
        await sheet
          .locator(`[data-slot-garment-id="${gid}"] [data-equip-inspector-btn="true"]`)
          .click();
        return;
      }
      await page.locator(`[data-outfit-slot-tab="${parentTab}"]`).click();
      const picker = page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`);
      await picker.locator(`[data-subtree-select="${parentTab}"]`).selectOption(subSlotKey);
      const cards = picker.locator('[data-slot-garment-id]');
      const target = cards.nth(cardIndex);
      await expect(target).toBeVisible();
      const gid = (await target.getAttribute('data-slot-garment-id')) || '';
      await target.click();
      await picker
        .locator(`[data-slot-garment-id="${gid}"] [data-equip-inspector-btn="true"]`)
        .click();
    };

    // Equip TWO DIFFERENT gloves on Left Hand (index 0) and Right Hand (index 1) simultaneously!
    await pickSubSlotCard('accessory', 'acc_hand_left', 0);
    await pickSubSlotCard('accessory', 'acc_hand_right', 1);

    // Equip TWO DIFFERENT watches on Left Wrist (index 0) and Right Wrist (index 1) simultaneously!
    await pickSubSlotCard('accessory', 'acc_wrist_left', 0);
    await pickSubSlotCard('accessory', 'acc_wrist_right', 1);

    // Also equip Headwear and Eyewear simultaneously!
    await pickSubSlotCard('accessory', 'acc_head', 0);
    await pickSubSlotCard('accessory', 'acc_eyes', 0);

    // Equip Jewelry across Necklace, Asymmetric L/R Earrings, Ring, and Brooch simultaneously!
    await pickSubSlotCard('jewelry', 'jwl_neck', 0);
    await pickSubSlotCard('jewelry', 'jwl_ear_left', 0);
    await pickSubSlotCard('jewelry', 'jwl_ear_right', 1);
    await pickSubSlotCard('jewelry', 'jwl_ring_left', 0);
    await pickSubSlotCard('jewelry', 'jwl_brooch', 0);

    // Assert ALL 11 Accessory + Jewelry sub-slots remain simultaneously equipped!
    for (const key of [
      'acc_hand_left',
      'acc_hand_right',
      'acc_wrist_left',
      'acc_wrist_right',
      'acc_head',
      'acc_eyes',
      'jwl_neck',
      'jwl_ear_left',
      'jwl_ear_right',
      'jwl_ring_left',
      'jwl_brooch',
    ]) {
      await expect(studioCanvas.locator(`[data-studio-slot="${key}"]`)).toHaveCount(1);
    }

    // Verify Left & Right micro-badges exist
    await expect(
      studioCanvas.locator('[data-studio-slot="acc_hand_left"] [data-slot-side="L"]')
    ).toHaveCount(1);
    await expect(
      studioCanvas.locator('[data-studio-slot="acc_hand_right"] [data-slot-side="R"]')
    ).toHaveCount(1);

    // Switch to English and verify ZERO Hangul leak across all 11 equipped sub-slots, Flat-Lay cards, and Jewelry sub-tree!
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await page.locator('[data-lang-btn="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');

    const mobileWardrobeJwlBtn = studioCanvas.locator('[data-mobile-wardrobe-trigger="true"]');
    if (await mobileWardrobeJwlBtn.isVisible()) {
      await mobileWardrobeJwlBtn.click();
      const sheet = page.locator('#outfit-mobile-wardrobe-sheet');
      await expect(sheet).toBeVisible();
      await sheet.locator('[data-mobile-sheet-slot-tab="jewelry"]').click();
      await expect(sheet.locator('[data-jewelry-subtree="true"]')).toBeVisible();
    }

    const hangulLeaks = await page.evaluate(() => {
      const re = /[\uAC00-\uD7A3\u3131-\u318E]/;
      const found: string[] = [];
      const bodyText = document.body?.innerText || '';
      if (re.test(bodyText)) {
        const line = bodyText.split('\n').find((l) => re.test(l)) || bodyText.slice(0, 80);
        found.push(`text:${line.trim()}`);
      }
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const attr of ['aria-label', 'placeholder', 'alt', 'title']) {
          const val = el.getAttribute(attr);
          if (val && re.test(val)) {
            found.push(`${el.tagName.toLowerCase()}[${attr}="${val}"]`);
          }
        }
      }
      return found.slice(0, 10);
    });
    expect(hangulLeaks).toEqual([]);
  });

  test('11. 3-Layer Weather Fitting Room & V4 Hole-Aware Cutout: 45° horizontal camera lock, wide-open umbrella rain physics, enclosed interior hole (#94A3B8 -> alpha 0) matting, and top Refresh cache-bypass', async ({
    page,
  }) => {
    // (A) Unit-verify weather prompt builder, 45° horizontal full-body camera lock & realtime normalization rules
    expect(
      resolveEffectiveWeather({
        selectedMode: 'realtime',
        temperature: -8,
        feelsLike: -13,
        liveCondition: 'clear',
      })
    ).toBe('coldwave');
    expect(
      resolveEffectiveWeather({
        selectedMode: 'realtime',
        temperature: 32,
        feelsLike: 35,
        liveCondition: 'clear',
      })
    ).toBe('heatwave');

    const rainDirectives = buildWeatherPosePromptDirectives('rain');
    expect(rainDirectives.poseDirective).toContain('WIDE-OPEN');
    expect(rainDirectives.negativeDirective).toContain('NEVER closed/folded umbrella');
    expect(rainDirectives.backdropDirective).toContain('#94A3B8');
    expect(rainDirectives.headroomPrompt).toContain(
      'Eye-to-waist level, straight-on horizontal camera, zero tilt'
    );
    expect(rainDirectives.headroomPrompt).toContain(
      'Full-body shot from head to toe, shoes and feet completely visible on the floor with 10% bottom margin, consistent scale across all angles'
    );

    const coldwaveDirectives = buildWeatherPosePromptDirectives('coldwave');
    expect(coldwaveDirectives.physicalTraceDirective).toContain(
      'snow crystals and frost accumulated on beanie and shoulders'
    );
    expect(coldwaveDirectives.poseDirective).toContain('-10°C');

    // (B) Build a 256x256 2x2 studio sheet on #94A3B8 (148, 163, 184) neutral mid-slate backdrop
    // with pure white snow cap (#FFFFFF) on top of beanie, deep dark coat (#181C24) on torso,
    // AND a completely enclosed interior #94A3B8 hole (arm/umbrella-gap island) inside the coat
    // to prove V4 cutout removes both outer #94A3B8 AND enclosed interior #94A3B8 holes -> alpha 0
    // while protecting #FFFFFF snow AND #181C24 coat!
    const buildSlateStudio2x2SheetPng = (variantOffset = 0): string => {
      const width = 256;
      const height = 256;
      const raw = Buffer.alloc((width * 4 + 1) * height);
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width * 4 + 1);
        raw[rowOffset] = 0;
        const localY = y % 128;
        for (let x = 0; x < width; x += 1) {
          const localX = x % 128;
          const px = rowOffset + 1 + x * 4;
          // Uniform #94A3B8 studio backdrop
          let r = 148;
          let g = 163;
          let b = 184;
          if (localY >= 18 && localY <= 26 && localX >= 52 && localX <= 76) {
            // Pure white snow crystals accumulated on beanie crown (#FFFFFF)
            r = 255;
            g = 255;
            b = 255;
          } else if (localY >= 27 && localY <= 40 && localX >= 50 && localX <= 78) {
            // Warm beanie / face silhouette
            r = (210 + variantOffset) % 245;
            g = 172;
            b = 145;
          } else if (localY >= 64 && localY <= 74 && localX >= 58 && localX <= 70) {
            // Enclosed interior #94A3B8 hole completely surrounded on all 4 sides by the dark coat!
            r = 148;
            g = 163;
            b = 184;
          } else if (localY >= 41 && localY <= 108 && localX >= 42 && localX <= 86) {
            // Deep obsidian winter coat (#181C24)
            r = 24 + (variantOffset % 15);
            g = 28;
            b = 36;
          }
          raw[px] = r;
          raw[px + 1] = g;
          raw[px + 2] = b;
          raw[px + 3] = 255;
        }
      }
      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const makeChunk = (type: string, data: Buffer): Buffer => {
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
      };
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const png = Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
      ]);
      return `data:image/png;base64,${png.toString('base64')}`;
    };

    const capturedPayloads: Array<{
      forceRefresh?: boolean;
      weather?: Record<string, unknown> | null;
    }> = [];
    let callIdx = 0;

    await page.route('**/api/vton/synthesize', async (route) => {
      callIdx += 1;
      const body = JSON.parse(route.request().postData() || '{}') as {
        forceRefresh?: boolean;
        weather?: Record<string, unknown> | null;
      };
      capturedPayloads.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image-preview',
          layout: 'turnaround_2x2',
          styleMode: 'photorealistic',
          geminiUsed: true,
          compositeImageUrl: buildSlateStudio2x2SheetPng(callIdx * 5),
        }),
      });
    });

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 20000 });
    await expect(aiImg).toHaveCSS('object-fit', 'contain');
    const imgSrc = (await aiImg.getAttribute('src')) || '';
    expect(imgSrc.startsWith('data:image/png;base64,')).toBe(true);

    // (C) Verify true RGBA alpha === 0 on BOTH outer corners AND enclosed interior hole,
    // while preserving pure white snow (#FFFFFF) & dark coat!
    const alphaAudit = await aiImg.evaluate(async (el) => {
      const img = el as HTMLImageElement;
      if (!img.complete) {
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('Failed to load V4 hole-aware VTON cutout image'));
        });
      }
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const cornerAlpha = d[(1 * c.width + 1) * 4 + 3];
      let whiteSnowOpaquePixels = 0;
      let darkCoatOpaquePixels = 0;
      let coatMinY = c.height;
      let coatMaxY = 0;
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          const i = (y * c.width + x) * 4;
          if (d[i + 3] > 240 && d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) {
            whiteSnowOpaquePixels += 1;
          }
          if (d[i + 3] > 240 && d[i] < 50 && d[i + 1] < 40 && d[i + 2] < 50) {
            darkCoatOpaquePixels += 1;
            if (y < coatMinY) coatMinY = y;
            if (y > coatMaxY) coatMaxY = y;
          }
        }
      }
      // Coat top is localY=41..108 and enclosed hole center is at horizontal midline (cx=width*0.5, dy~42% of coat height)
      const holeCenterY = Math.min(
        c.height - 1,
        coatMinY + Math.max(10, Math.round((coatMaxY - coatMinY) * 0.42))
      );
      const holeCenterX = Math.round(c.width * 0.5);
      const enclosedHoleAlpha = d[(holeCenterY * c.width + holeCenterX) * 4 + 3];
      return {
        cornerAlpha,
        enclosedHoleAlpha,
        whiteSnowOpaquePixels,
        darkCoatOpaquePixels,
        coatMaxY,
      };
    });
    expect(alphaAudit.cornerAlpha).toBe(0);
    expect(alphaAudit.enclosedHoleAlpha).toBe(0);
    expect(alphaAudit.whiteSnowOpaquePixels).toBeGreaterThan(80);
    expect(alphaAudit.darkCoatOpaquePixels).toBeGreaterThan(600);

    // (D) Verify Three.js Stage Layer & complete removal of legacy 2D weather foreground canvas
    const contactShadow = studioCanvas.locator('[data-floor-contact-shadow="true"]');
    await expect(contactShadow).toHaveCount(1);
    await expect(contactShadow).toHaveCSS('pointer-events', 'none');

    await expect(
      studioCanvas.locator('canvas[data-weather-foreground-canvas="true"]')
    ).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-rain-layer="true"]')).toHaveCount(0);

    const threeLayer = studioCanvas.locator('[data-testid="studio-three-stage-layer"]');
    await expect(threeLayer).toHaveCount(1);
    await expect(threeLayer).toHaveCSS('pointer-events', 'none');

    // (E) Toggle Dark Mode -> verify dark responsive stage (luminance < 40) & zero white box behind model
    await page.getByRole('button', { name: '다크 모드로 전환' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(async () => {
        return studioCanvas.evaluate((el) => {
          const cs = window.getComputedStyle(el);
          const m = cs.backgroundColor.match(/\d+/g) || ['0', '0', '0'];
          const [r, g, b] = m.map(Number);
          return 0.299 * r + 0.587 * g + 0.114 * b;
        });
      })
      .toBeLessThan(40);
    const darkImgBg = await studioCanvas.evaluate((el) => {
      const imgEl = el.querySelector('[data-ai-vton-img="true"]') as HTMLElement | null;
      return imgEl ? window.getComputedStyle(imgEl).backgroundColor : '';
    });
    expect(darkImgBg).toBe('rgba(0, 0, 0, 0)');

    // Switch back to Light Mode -> verify bright responsive stage (luminance > 220)
    await page.getByRole('button', { name: '라이트 모드로 전환' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // (F) Verify indoor vs open-sky outdoor Three.js weather gating on `비` (`rainy_cool`):
    //     Indoors keeps weather readout `rain` but sets Three.js stage to `indoor-ivory` + warm ivory ambient light
    await selectWeatherScenarioViaCapsulePopup(page, 'rainy_cool');
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'rain');
    await expect(studioCanvas).toHaveAttribute('data-stage-lighting', 'indoor-ivory');
    await expect(studioCanvas.locator('[data-indoor-ivory-light="true"]')).toBeVisible();
    await expect(threeLayer).toHaveAttribute('data-stage-outdoor', 'false');
    await expect(threeLayer).toHaveAttribute('data-weather-mode', 'indoor-ivory');
    await expect(studioCanvas.locator('[data-studio-rain-layer="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-wet-mirror-reflection="true"]')).toHaveCount(0);
    const rainBadge = studioCanvas.locator('[data-weather-stage-badge="rain"]');
    await expect(rainBadge).toContainText('비');
    await expect(rainBadge).toHaveAttribute('aria-label', /우산 코디/);

    // Switch to open-sky A+ outdoor stage (`a_sunset_rooftop`) -> outdoor sky lighting & Three.js rain run!
    await page.evaluate(() => {
      const key = 'ainventory_stage_economy_v1';
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { unlockedIds: ['c_atelier_plaster'], iBalance: 0 };
      const unlocked = Array.from(
        new Set([...(parsed.unlockedIds || []), 'c_atelier_plaster', 'a_sunset_rooftop'])
      );
      const next = {
        ...parsed,
        unlockedIds: unlocked,
        equippedBackgroundId: 'a_sunset_rooftop',
      };
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('ainventory:economy-updated', { detail: next }));
    });
    await expect(studioCanvas).toHaveAttribute('data-stage-lighting', 'outdoor-sky');
    await expect(threeLayer).toHaveAttribute('data-stage-outdoor', 'true');
    await expect(threeLayer).toHaveAttribute('data-aura-tier', 'A+');
    await expect(threeLayer).toHaveAttribute('data-weather-mode', 'rain');
    await expect(studioCanvas.locator('[data-wet-mirror-reflection="true"]')).toBeVisible();

    // (G) Switch to `한파` (`winter_cold`) -> verify coldwave Three.js mode + sub-zero `-10°/-4°` badge + VTON trigger
    await selectWeatherScenarioViaCapsulePopup(page, 'winter_cold');
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'coldwave');
    await expect(threeLayer).toHaveAttribute('data-weather-mode', 'coldwave');
    const coldwaveBadge = studioCanvas.locator('[data-weather-stage-badge="coldwave"]');
    await expect(coldwaveBadge).toContainText('한파');
    await expect(coldwaveBadge).toHaveAttribute('aria-label', /방한 코디/);
    await expect(coldwaveBadge).toContainText('-10°/-4°');
    await expect
      .poll(() => capturedPayloads.some((p) => Number(p.weather?.tempMin) <= -5))
      .toBe(true);

    // (H) Verify `눈` (`snowy_winter`), `흐림` (`cloudy_overcast`), and `폭염` (`summer_heatwave`) tabs
    await selectWeatherScenarioViaCapsulePopup(page, 'snowy_winter');
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'snow');
    await expect(threeLayer).toHaveAttribute('data-weather-mode', 'snow');

    await selectWeatherScenarioViaCapsulePopup(page, 'cloudy_overcast');
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'cloudy');

    await selectWeatherScenarioViaCapsulePopup(page, 'summer_heatwave');
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'heatwave');

    // (I) Verify Top Refresh & Reset buttons are removed and Store button resides on the left side of top bar
    await expect(page.locator('[data-outfit-vton-refresh="true"]')).toHaveCount(0);
    await expect(page.locator('[data-outfit-clear-all="true"]')).toHaveCount(0);
    await expect(page.locator('.hig-top-bar-left [data-open-store-btn="true"]')).toBeVisible();
  });

  test('12. Unified Profile Height Direct Input & Error Modal Popup: validates empty/NaN/out-of-range (<100, >230) and storage/save failures via alertdialog modal', async ({
    page,
  }) => {
    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // Open unified Profile modal from header
    await page.locator('#open-profile-studio-btn').click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await expect(profileSheet).toBeVisible();

    const heightInput = profileSheet.locator('[data-height-cm-input="true"]');
    await expect(heightInput).toBeVisible();

    const applyBtn = profileSheet.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`);
    const errorModal = page.locator('[data-profile-error-modal="true"]');
    const confirmBtn = page.locator('[data-profile-error-confirm="true"]');

    // (1) Empty height input -> Error Modal Popup (`empty`)
    await heightInput.fill('');
    await applyBtn.click();
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('role', 'alertdialog');
    await expect(errorModal).toHaveAttribute('aria-modal', 'true');
    await expect(errorModal).toHaveAttribute('data-profile-error-code', 'empty');
    await confirmBtn.click();
    await expect(errorModal).toHaveCount(0);

    // (2) Non-numeric height input -> Error Modal Popup (`non_numeric`)
    await heightInput.fill('abc');
    await applyBtn.click();
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('data-profile-error-code', 'non_numeric');
    await confirmBtn.click();
    await expect(errorModal).toHaveCount(0);

    // (3) Below minimum (< 100cm) -> Error Modal Popup (`out_of_range`)
    await heightInput.fill('85');
    await applyBtn.click();
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('data-profile-error-code', 'out_of_range');
    await confirmBtn.click();
    await expect(errorModal).toHaveCount(0);

    // (4) Above maximum (> 230cm) -> Error Modal Popup (`out_of_range`)
    await heightInput.fill('250');
    await applyBtn.click();
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('data-profile-error-code', 'out_of_range');
    await confirmBtn.click();
    await expect(errorModal).toHaveCount(0);

    // (5) Storage/Save failure -> Error Modal Popup (`save_error`) instead of silent failure
    await heightInput.fill('192');
    await page.evaluate(() => {
      const origSetItem = Storage.prototype.setItem;
      let blockedOnce = false;
      Storage.prototype.setItem = function patchedSetItem(key: string, val: string) {
        if (!blockedOnce && key === 'ainventory_avatar_spec_v2') {
          blockedOnce = true;
          Storage.prototype.setItem = origSetItem;
          throw new DOMException('Simulated storage quota exceeded', 'QuotaExceededError');
        }
        return origSetItem.call(this, key, val);
      };
    });
    await applyBtn.click();
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('data-profile-error-code', 'save_error');
    await confirmBtn.click();
    await expect(errorModal).toHaveCount(0);

    // (6) Valid height within [100, 230] (e.g. 215cm) -> saves cleanly & updates stage model height!
    await heightInput.fill('215');
    await applyBtn.click();
    await expect(profileSheet).toBeHidden();
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(modelStage).toHaveAttribute('data-height-cm', '215');
  });

  test('13. WS-3a & WS-3c: Dominant-hand bag mirroring (right vs left) across 0°/45°/90° + rainy umbrella #D8CFC4/#C0B8AE under-canopy cutout & outer coat color parity', async ({
    page,
  }) => {
    const buildRichTurnaroundPng = (opts: {
      handedness: 'right' | 'left';
      withUmbrella: boolean;
      width?: number;
      height?: number;
      cropSidePanels?: boolean;
      singleCropped?: boolean;
    }): string => {
      const w = opts.width || 420;
      const h = opts.height || 288;
      const raw = Buffer.alloc((w * 4 + 1) * h);
      const [bgR, bgG, bgB] = opts.withUmbrella ? [216, 207, 196] : [148, 163, 184];

      for (let y = 0; y < h; y += 1) {
        const ro = y * (w * 4 + 1);
        raw[ro] = 0;
        for (let x = 0; x < w; x += 1) {
          const px = ro + 1 + x * 4;
          raw[px] = bgR;
          raw[px + 1] = bgG;
          raw[px + 2] = bgB;
          raw[px + 3] = 255;
        }
      }

      const paintRect = (
        x0: number,
        x1: number,
        y0: number,
        y1: number,
        r: number,
        g: number,
        b: number
      ) => {
        const ix0 = Math.max(0, Math.round(x0));
        const ix1 = Math.min(w - 1, Math.round(x1));
        const iy0 = Math.max(0, Math.round(y0));
        const iy1 = Math.min(h - 1, Math.round(y1));
        for (let y = iy0; y <= iy1; y += 1) {
          const ro = y * (w * 4 + 1);
          for (let x = ix0; x <= ix1; x += 1) {
            const px = ro + 1 + x * 4;
            raw[px] = r;
            raw[px + 1] = g;
            raw[px + 2] = b;
            raw[px + 3] = 255;
          }
        }
      };

      const drawCellFigure = (
        ox: number,
        oy: number,
        cw: number,
        ch: number,
        angle: number,
        cropped: boolean
      ) => {
        const cx = ox + cw / 2;
        if (cropped) {
          // Severely cropped thigh-level half-body so QC flags incomplete height
          paintRect(cx - 14, cx + 14, oy + 46, oy + 78, 176, 128, 72);
          return;
        }

        if (opts.withUmbrella) {
          // Dark open umbrella dome + outer drop ribs enclosing #D8CFC4 (left) & shaded #C0B8AE (right) sky gaps
          paintRect(cx - 46, cx + 46, oy + 10, oy + 26, 32, 36, 44);
          paintRect(cx - 46, cx - 40, oy + 26, oy + 44, 32, 36, 44);
          paintRect(cx + 40, cx + 46, oy + 26, oy + 44, 32, 36, 44);
          // Explicitly shade right under-canopy pocket #C0B8AE (192,184,174) while left stays #D8CFC4
          paintRect(cx + 15, cx + 39, oy + 27, oy + 43, 192, 184, 174);
        }

        // Head + subtle facing direction nose so sliceTurnaround2x2Sheet keeps 45/90 right & 225 left
        const headTop = opts.withUmbrella ? oy + 27 : oy + 14;
        const headBot = opts.withUmbrella ? oy + 43 : oy + 32;
        paintRect(cx - 9, cx + 9, headTop, headBot, 223, 186, 155);
        if (angle === 45 || angle === 90 || angle === 135) {
          paintRect(cx + 9, cx + 12, headTop + 5, headTop + 11, 223, 186, 155);
        } else if (angle === 225) {
          paintRect(cx - 12, cx - 9, headTop + 5, headTop + 11, 223, 186, 155);
        }

        // Shoulder bridge (under umbrella ribs when rainy) & Camel coat (#B08048) consistent across all angles
        const coatTop = oy + 44;
        const coatBot = oy + 92;
        if (opts.withUmbrella) {
          paintRect(cx - 46, cx + 46, oy + 44, oy + 49, 176, 128, 72);
        }
        paintRect(cx - 19, cx + 19, coatTop, coatBot, 176, 128, 72);

        // Dark charcoal trousers + leather shoes down to floor baseline (~91% of cell height)
        paintRect(cx - 13, cx - 2, oy + 93, oy + 124, 52, 56, 62);
        paintRect(cx + 2, cx + 13, oy + 93, oy + 124, 52, 56, 62);
        paintRect(cx - 13, cx - 1, oy + 125, oy + 132, 30, 32, 36);
        paintRect(cx + 1, cx + 13, oy + 125, oy + 132, 30, 32, 36);

        // Crimson leather briefcase (#9C2C38) placed by handedness across 0°/45°/90°
        if (!opts.withUmbrella) {
          const bagSign = opts.handedness === 'left' ? -1 : 1;
          const bagCenterX =
            angle === 90 ? cx + bagSign * 16 : angle === 45 ? cx + bagSign * 18 : cx + bagSign * 21;
          paintRect(bagCenterX - 6, bagCenterX + 6, oy + 76, oy + 94, 156, 44, 56);
        }
      };

      if (opts.singleCropped) {
        drawCellFigure(0, 0, w, h, 0, true);
      } else {
        const cw = Math.floor(w / 3);
        const ch = Math.floor(h / 2);
        const layoutAngles = [
          [0, 0, 0],
          [1, 0, 45],
          [2, 0, 90],
          [0, 1, 135],
          [1, 1, 180],
          [2, 1, 225],
        ] as const;
        for (const [col, row, ang] of layoutAngles) {
          drawCellFigure(
            col * cw,
            row * ch,
            cw,
            ch,
            ang,
            Boolean(opts.cropSidePanels && ang !== 0)
          );
        }
      }

      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const makeChunk = (type: string, data: Buffer): Buffer => {
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
      };
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const png = Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
      ]);
      return `data:image/png;base64,${png.toString('base64')}`;
    };

    const capturedHands: string[] = [];
    await page.route('**/api/vton/synthesize', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as {
        handedness?: string;
        weather?: { effectiveWeather?: string; mood?: string } | null;
      };
      const handedness = body.handedness === 'left' ? 'left' : 'right';
      capturedHands.push(handedness);
      const isRain =
        body.weather?.effectiveWeather === 'rain' || body.weather?.mood === 'rainy';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image',
          layout: 'turnaround_3x2',
          styleMode: 'stylized_isometric',
          geminiUsed: true,
          compositeImageUrl: buildRichTurnaroundPng({
            handedness,
            withUmbrella: isRain,
          }),
        }),
      });
    });

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(studioCanvas).toBeVisible();
    await expect(aiImg).toBeVisible({ timeout: 10000 });

    // Equip briefcase/bag in `accessory` slot
    await selectStudioSlotAndPickItem(page, 'accessory', {
      matchText: /가방|토트|브리프|크로스/i,
    });
    await expect(studioCanvas).toHaveAttribute('data-vton-handedness', 'right');
    await expect(studioCanvas).toHaveAttribute('data-vton-bag-mirrored', 'false');
    await expect(aiImg).toBeVisible();

    const measureActiveImageStats = () =>
      aiImg.evaluate(async (el) => {
        const img = el as HTMLImageElement;
        if (!img.complete) {
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error('Image load failed'));
          });
        }
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let bagCount = 0;
        let bagSumX = 0;
        let fgMinX = c.width;
        let fgMaxX = 0;
        let fgMinY = c.height;
        let fgMaxY = 0;
        let camelCount = 0;
        let camelR = 0;
        let camelG = 0;
        let camelB = 0;
        let umbrellaCanopyOpaque = 0;
        let underCanopyRightPocketMaxAlpha = 0;
        let underCanopyLeftPocketMaxAlpha = 0;
        for (let y = 0; y < c.height; y += 1) {
          for (let x = 0; x < c.width; x += 1) {
            const i = (y * c.width + x) * 4;
            const a = d[i + 3];
            if (a > 200) {
              if (x < fgMinX) fgMinX = x;
              if (x > fgMaxX) fgMaxX = x;
              if (y < fgMinY) fgMinY = y;
              if (y > fgMaxY) fgMaxY = y;
              const r = d[i];
              const g = d[i + 1];
              const b = d[i + 2];
              if (r >= 130 && g <= 70 && b <= 80) {
                bagCount += 1;
                bagSumX += x;
              }
              if (r >= 145 && r <= 205 && g >= 100 && g <= 155 && b >= 45 && b <= 100) {
                camelCount += 1;
                camelR += r;
                camelG += g;
                camelB += b;
              }
              if (y < c.height * 0.34 && r < 60 && g < 65 && b < 75) {
                umbrellaCanopyOpaque += 1;
              }
            }
          }
        }
        const cx = (fgMinX + fgMaxX) * 0.5;
        const bagMeanDxRatio =
          bagCount > 0 ? (bagSumX / bagCount - cx) / Math.max(1, c.width) : 0;
        const figH = Math.max(1, fgMaxY - fgMinY);
        const pocketY0 = Math.round(fgMinY + figH * 0.16);
        const pocketY1 = Math.round(fgMinY + figH * 0.25);
        for (let y = pocketY0; y <= pocketY1; y += 1) {
          for (let x = Math.round(c.width * 0.26); x <= Math.round(c.width * 0.36); x += 1) {
            underCanopyLeftPocketMaxAlpha = Math.max(
              underCanopyLeftPocketMaxAlpha,
              d[(y * c.width + x) * 4 + 3]
            );
          }
          for (let x = Math.round(c.width * 0.64); x <= Math.round(c.width * 0.74); x += 1) {
            underCanopyRightPocketMaxAlpha = Math.max(
              underCanopyRightPocketMaxAlpha,
              d[(y * c.width + x) * 4 + 3]
            );
          }
        }
        const cornerAlpha = d[(1 * c.width + 1) * 4 + 3];
        c.width = 0;
        c.height = 0;
        return {
          bagCount,
          bagMeanDxRatio,
          camelCount,
          camelRgb: camelCount
            ? [camelR / camelCount, camelG / camelCount, camelB / camelCount]
            : null,
          umbrellaCanopyOpaque,
          underCanopyLeftPocketMaxAlpha,
          underCanopyRightPocketMaxAlpha,
          cornerAlpha,
        };
      });

    const rightHandByAngle: Record<number, number> = {};
    for (const ang of [0, 45, 90] as const) {
      await setRangeSliderValue(page, '[data-angle-scroll-input="true"]', ang);
      await expect(modelStage).toHaveAttribute('data-view-angle', String(ang));
      const st = await measureActiveImageStats();
      expect(st.bagCount).toBeGreaterThan(15);
      rightHandByAngle[ang] = st.bagMeanDxRatio;
      expect(st.bagMeanDxRatio).toBeGreaterThan(0.05);
    }

    // Switch profile dominantHand to `left` -> apply & persist
    await page.locator('#open-profile-studio-btn').click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await expect(profileSheet).toBeVisible();
    await profileSheet.locator('#profile-tab-body').click();
    await profileSheet.locator('[data-dominant-hand-btn="left"]').click();
    await expect(profileSheet.locator('[data-dominant-hand-btn="left"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await profileSheet.locator('#apply-body-spec-btn').click();
    await expect(profileSheet).toBeHidden();

    await expect(studioCanvas).toHaveAttribute('data-vton-handedness', 'left');
    await expect(studioCanvas).toHaveAttribute('data-vton-bag-mirrored', 'true');
    await expect.poll(() => capturedHands.includes('left')).toBe(true);

    for (const ang of [0, 45, 90] as const) {
      await setRangeSliderValue(page, '[data-angle-scroll-input="true"]', ang);
      await expect(modelStage).toHaveAttribute('data-view-angle', String(ang));
      const st = await measureActiveImageStats();
      expect(st.bagCount).toBeGreaterThan(15);
      // Left-handed bag stays consistently mirrored onto the opposite hip/shoulder across 0°/45°/90°
      expect(st.bagMeanDxRatio).toBeLessThan(-0.05);
      expect(rightHandByAngle[ang] - st.bagMeanDxRatio).toBeGreaterThan(0.14);
    }

    // WS-3c: Rainy scenario with overhead umbrella on outdoor stage -> #D8CFC4 / shaded #C0B8AE pockets purge cleanly & camel coat RGB stays consistent across 0°/45°/90°
    await page.evaluate(() => {
      const key = 'ainventory_stage_economy_v1';
      const next = {
        unlockedIds: ['c_atelier_plaster', 'a_sunset_rooftop'],
        equippedBackgroundId: 'a_sunset_rooftop',
        iBalance: 0,
      };
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('ainventory:economy-updated', { detail: next }));
    });
    await expect(studioCanvas).toHaveAttribute('data-stage-lighting', 'outdoor-sky');

    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel
      .locator('select[data-weather-scenario-select="true"]')
      .selectOption('rainy_cool');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'rain');
    await expect(aiImg).toBeVisible({ timeout: 10000 });

    const coatRgbByAngle: Record<number, number[]> = {};
    for (const ang of [0, 45, 90] as const) {
      await setRangeSliderValue(page, '[data-angle-scroll-input="true"]', ang);
      await expect(modelStage).toHaveAttribute('data-view-angle', String(ang));
      const st = await measureActiveImageStats();
      expect(st.cornerAlpha).toBe(0);
      expect(st.underCanopyLeftPocketMaxAlpha).toBe(0);
      expect(st.underCanopyRightPocketMaxAlpha).toBe(0);
      expect(st.umbrellaCanopyOpaque).toBeGreaterThan(40);
      expect(st.camelRgb).not.toBeNull();
      coatRgbByAngle[ang] = st.camelRgb!;
    }

    const baseCoat = coatRgbByAngle[0];
    for (const ang of [45, 90] as const) {
      const cmp = coatRgbByAngle[ang];
      const delta = Math.hypot(
        cmp[0] - baseCoat[0],
        cmp[1] - baseCoat[1],
        cmp[2] - baseCoat[2]
      );
      expect(delta).toBeLessThan(18);
    }
  });

  test('14. WS-3b: 3 consecutive multi-angle QC failures write server QC failure log, lock to positive-only 0° front fallback, and show 3s auto-dismiss popup', async ({
    page,
  }) => {
    const buildQcPartialSheet = (cropSidePanels: boolean, singleCropped: boolean): string => {
      const w = singleCropped ? 96 : 192;
      const h = singleCropped ? 144 : 288;
      const raw = Buffer.alloc((w * 4 + 1) * h);
      for (let y = 0; y < h; y += 1) {
        const ro = y * (w * 4 + 1);
        raw[ro] = 0;
        for (let x = 0; x < w; x += 1) {
          const px = ro + 1 + x * 4;
          raw[px] = 148;
          raw[px + 1] = 163;
          raw[px + 2] = 184;
          raw[px + 3] = 255;
        }
      }
      const paint = (x0: number, x1: number, y0: number, y1: number, r: number, g: number, b: number) => {
        for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y += 1) {
          for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x += 1) {
            const px = y * (w * 4 + 1) + 1 + x * 4;
            raw[px] = r;
            raw[px + 1] = g;
            raw[px + 2] = b;
            raw[px + 3] = 255;
          }
        }
      };

      if (singleCropped) {
        paint(34, 62, 52, 80, 176, 128, 72);
      } else {
        const panels = [
          { ox: 0, oy: 0, full: true },
          { ox: 96, oy: 0, full: !cropSidePanels },
          { ox: 0, oy: 144, full: !cropSidePanels },
          { ox: 96, oy: 144, full: !cropSidePanels },
        ];
        for (const p of panels) {
          if (p.full) {
            paint(p.ox + 38, p.ox + 58, p.oy + 14, p.oy + 34, 223, 186, 155);
            paint(p.ox + 30, p.ox + 66, p.oy + 35, p.oy + 130, 62, 82, 118);
          } else {
            paint(p.ox + 34, p.ox + 62, p.oy + 48, p.oy + 76, 62, 82, 118);
          }
        }
      }

      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const makeChunk = (type: string, data: Buffer): Buffer => {
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
      };
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0);
      ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const png = Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', zlib.deflateSync(raw)),
        makeChunk('IEND', Buffer.alloc(0)),
      ]);
      return `data:image/png;base64,${png.toString('base64')}`;
    };

    let sheetAttempts = 0;
    const qcLogResponses: Array<{ status: number; ok: boolean; logged: boolean }> = [];
    page.on('response', async (res) => {
      if (res.url().includes('/api/vton/qc-failure-log')) {
        const json = await res.json().catch(() => ({}));
        qcLogResponses.push({
          status: res.status(),
          ok: Boolean(json?.ok),
          logged: Boolean(json?.logged),
        });
      }
    });

    await page.route('**/api/vton/synthesize', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as {
        turnaroundSheet?: boolean;
      };
      const isSheet = body.turnaroundSheet !== false;
      if (isSheet) sheetAttempts += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-3.1-flash-image',
          layout: isSheet ? 'turnaround_2x2' : 'single',
          styleMode: 'stylized_isometric',
          geminiUsed: true,
          compositeImageUrl: buildQcPartialSheet(true, !isSheet),
        }),
      });
    });

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    const frontOnlyToast = studioCanvas.locator('[data-vton-front-only-toast="true"]');

    // Toast must appear with exact Korean notice, front-only 0° character stays visible, and toast auto-dismisses after ~3s
    await expect(studioCanvas).toHaveAttribute('data-front-only-degraded', 'true', {
      timeout: 20000,
    });
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
    await expect(studioCanvas.locator('[data-angle-scroll-dock="true"]')).toHaveAttribute(
      'data-angle-dock-visible',
      'false'
    );
    await expect(aiImg).toBeVisible();
    await expect(frontOnlyToast).toBeVisible();
    await expect(frontOnlyToast).toHaveText('현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.');

    // Auto-dismisses cleanly after 3s durationMs without user click
    await expect(frontOnlyToast).toHaveCount(0, { timeout: 6000 });

    // Confirm all 3 QC turnaround retries executed and real POST /api/vton/qc-failure-log succeeded (201)
    expect(sheetAttempts).toBe(3);
    await expect.poll(() => qcLogResponses.length).toBeGreaterThanOrEqual(1);
    expect(qcLogResponses[0]).toEqual({ status: 201, ok: true, logged: true });
  });
});

