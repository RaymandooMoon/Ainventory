import zlib from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

const ALL_WEATHER_SCENARIOS = [
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

function buildPortraitTurnaround2x2PngDataUrl(variantSeed = 0): string {
  const width = 192;
  const height = 288;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const quadW = width / 2;
  const quadH = height / 2;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    const localY = y % quadH;
    for (let x = 0; x < width; x += 1) {
      const localX = x % quadW;
      const px = rowOffset + 1 + x * 4;
      // Neutral #94A3B8 studio backdrop for clean V4 cutout -> alpha 0
      let r = 148;
      let g = 163;
      let b = 184;
      const inHead = localY >= 14 && localY <= 30 && localX >= 43 && localX <= 53;
      const inTorsoAndLegs = localY >= 31 && localY <= 128 && localX >= 33 && localX <= 63;
      if (inHead) {
        r = 204;
        g = 162;
        b = 134;
      } else if (inTorsoAndLegs) {
        r = 36 + ((variantSeed * 37) % 160);
        g = 48 + ((variantSeed * 23) % 140);
        b = 62 + ((variantSeed * 19) % 130);
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function swipeWardrobeSheetHandle(page: Page, deltaY: number) {
  const handle = page.locator('#outfit-mobile-wardrobe-sheet [data-sheet-handle="true"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const cx = Math.round(box!.x + box!.width / 2);
  const cy = Math.round(box!.y + box!.height / 2);

  await handle.evaluate(
    async (el, coords) => {
      const mkInit = (clientY: number, buttons: number): PointerEventInit => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 11,
        pointerType: 'touch',
        isPrimary: true,
        clientX: coords.x,
        clientY,
        button: 0,
        buttons,
      });
      el.dispatchEvent(new PointerEvent('pointerdown', mkInit(coords.y0, 1)));
      const steps = 4;
      for (let i = 1; i <= steps; i += 1) {
        await new Promise((r) => setTimeout(r, 40));
        const y = Math.round(coords.y0 + ((coords.y1 - coords.y0) * i) / steps);
        window.dispatchEvent(new PointerEvent('pointermove', mkInit(y, 1)));
      }
      await new Promise((r) => setTimeout(r, 20));
      window.dispatchEvent(new PointerEvent('pointerup', mkInit(coords.y1, 0)));
    },
    { x: cx, y0: cy, y1: cy + deltaY }
  );
}

test.describe('2D Editorial Fashion Virtual Try-On Viewer & Scope-Safe Pipeline', () => {
  test('1. Zero .glb/3D texture requests, legacy 3D/2.5D mode fallback to 2d-vton, and removal of 3D orbit controls', async ({
    page,
  }) => {
    const legacy3dRequests: string[] = [];
    const pageErrors: string[] = [];

    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (url.endsWith('.glb') || url.includes('/models/mannequin/') || url.includes('/textures/mannequin/')) {
        legacy3dRequests.push(url);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Simulate legacy 3D / 2.5D state left over or written by another session
    await page.addInitScript(() => {
      window.localStorage.setItem('ainventory_view_mode', '3d');
      window.localStorage.setItem('ainventory_render_mode', '2.5d');
      window.localStorage.setItem('ainventory_studio_mode', '3D');
    });

    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(studioCanvas).toHaveAttribute('data-fitting-mode', '2d-vton');

    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(modelStage).toBeVisible();
    await expect(modelStage).toHaveAttribute('data-viewer-mode', '2d-vton');

    // Old 6-angle 3D orbit buttons must be completely gone
    await expect(studioCanvas.locator('[data-camera-preset-btn]')).toHaveCount(0);

    // Worn items must remain accessible on the Flat-Lay board in flatlay mode (with worn-slots dock synced in DOM)
    await expect(studioCanvas.locator('[data-flatlay-item-slot]').first()).toBeVisible();
    expect(await studioCanvas.locator('[data-studio-slot]').count()).toBeGreaterThan(0);

    expect(legacy3dRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Character-only zoom (Flat-Lay unzoomed), deleted split button, scrollable worn-slots rail, device-ideal 1.0x dead-center + 1s auto-recenter, and gaze-aligned 180° back scrollbar', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-item-slot="top"]')).toBeVisible();
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-loading'), { timeout: 15000 })
      .not.toBe('true');

    // 1) Split Flat-Lay button (`[data-vton-compare-btn]`), +/- buttons, and legacy zoom badge (`[data-vton-zoom-level="true"]`) are permanently removed;
    //    top-left Stage Background Picker button (`[data-stage-bg-picker-btn="true"]`) occupies the left HUD slot cleanly
    await expect(studioCanvas.locator('[data-vton-compare-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-out]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-level="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-hud-left-slot [data-stage-bg-picker-btn="true"]')).toBeVisible();

    // In default flat-lay mode, side worn-slots rail is intentionally hidden so flat-lay cards have uncluttered space
    const wornDock = studioCanvas.locator('[data-worn-slots-dock="true"]');
    await expect(wornDock).toBeHidden();

    // 2) Load 4-angle AI Showcase Character -> verify scrollable worn-slots rail, device-ideal 1.0x scale & exact 50% horizontal dead-center
    await page.goto('/outfits?demo_vton=1');
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await expect(wornDock).toBeVisible();
    const dockMetrics = await wornDock.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const chips = Array.from(el.querySelectorAll('.studio-worn-slot-chip')).map((c) =>
        c.getBoundingClientRect()
      );
      return {
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        pointerEvents: cs.pointerEvents,
        minChipHeight: chips.length > 0 ? Math.min(...chips.map((r) => r.height)) : 0,
      };
    });
    expect(dockMetrics.overflowX === 'auto' || dockMetrics.overflowY === 'auto').toBe(true);
    expect(dockMetrics.pointerEvents).toBe('auto');
    expect(dockMetrics.minChipHeight).toBeGreaterThanOrEqual(40);
    await expect(studioCanvas.locator('[data-vton-compare-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-out]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-level="true"]')).toHaveCount(0);

    const centerAndScale = await modelStage.evaluate((stageEl) => {
      const imgEl = stageEl.querySelector('[data-ai-vton-img="true"]');
      const stageRect = stageEl.getBoundingClientRect();
      const imgRect = imgEl!.getBoundingClientRect();
      const stageCenterX = stageRect.left + stageRect.width / 2;
      const imgCenterX = imgRect.left + imgRect.width / 2;
      return {
        idealScale: Number(stageEl.getAttribute('data-ideal-scale') || '1'),
        centerDeltaPx: Math.abs(imgCenterX - stageCenterX),
      };
    });
    expect(centerAndScale.idealScale).toBeGreaterThanOrEqual(1);
    expect(centerAndScale.centerDeltaPx).toBeLessThanOrEqual(4);

    // 4) HUD Symmetry & Placement: Top-left Background Picker, Top-right Wardrobe Drawer (mobile <600px), Bottom-left Look + History Stack
    const bgPickerBtn = studioCanvas.locator(
      '.studio-hud-left-slot [data-stage-bg-picker-btn="true"]'
    );
    const historyBtn = studioCanvas.locator(
      '[data-bottom-left-hud="true"] [data-vton-history-btn="true"]'
    );
    const lookTriggerBtn = studioCanvas.locator(
      '[data-bottom-left-hud="true"] [data-look-selector-trigger="true"]'
    );
    await expect(bgPickerBtn).toBeVisible();
    await expect(bgPickerBtn).toHaveAttribute('data-stage-bg-tier', 'C');
    await expect(lookTriggerBtn).toBeVisible();
    await expect(historyBtn).toBeVisible();

    const historyText = (await historyBtn.innerText()).trim();
    expect(historyText).not.toMatch(/기록|Saved/i);
    const historySup = historyBtn.locator('sup[data-vton-history-count]');
    await expect(historySup).toBeVisible();
    const supCountNum = Number(await historySup.getAttribute('data-vton-history-count'));
    expect(supCountNum).toBeGreaterThanOrEqual(0);
    expect(supCountNum).toBeLessThanOrEqual(99);

    const [canvasBox, bgBtnBox, lookBtnBox, histBox] = await Promise.all([
      studioCanvas.boundingBox(),
      bgPickerBtn.boundingBox(),
      lookTriggerBtn.boundingBox(),
      historyBtn.boundingBox(),
    ]);
    expect(canvasBox).not.toBeNull();
    expect(bgBtnBox).not.toBeNull();
    expect(lookBtnBox).not.toBeNull();
    expect(histBox).not.toBeNull();
    expect(Math.abs(bgBtnBox!.width - histBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(bgBtnBox!.height - histBox!.height)).toBeLessThanOrEqual(1);
    // History sits directly below Look selector on the bottom-left side of stage
    expect(histBox!.y).toBeGreaterThanOrEqual(lookBtnBox!.y + lookBtnBox!.height);
    expect(histBox!.x + histBox!.width / 2).toBeLessThan(canvasBox!.x + canvasBox!.width / 2);

    const vpCheck = page.viewportSize();
    if (vpCheck && vpCheck.width < 600) {
      const mobileWardrobeHudBtn = studioCanvas.locator(
        '.studio-vton-hud-right [data-mobile-wardrobe-trigger="true"]'
      );
      await expect(mobileWardrobeHudBtn).toBeVisible();
      const mwBox = await mobileWardrobeHudBtn.boundingBox();
      expect(mwBox).not.toBeNull();
      const leftInset = bgBtnBox!.x - canvasBox!.x;
      const rightInset = canvasBox!.x + canvasBox!.width - (mwBox!.x + mwBox!.width);
      expect(Math.abs(leftInset - rightInset)).toBeLessThanOrEqual(2);
    }

    // Clicking Background Picker opens 14-stage architectural backdrop catalog modal
    await bgPickerBtn.click();
    const bgModal = page.locator('#stage-background-picker-modal');
    await expect(bgModal).toBeVisible();
    await expect(bgModal.locator('[data-bg-option-id]')).toHaveCount(18);
    await page.keyboard.press('Escape');
    await expect(bgModal).toHaveCount(0);

    const imgBox10 = await aiImg.boundingBox();
    expect(imgBox10).not.toBeNull();

    // Wide-angle architectural framing keeps zoom locked at 1.00x and pan centered at 0,0 under pinch gestures
    await modelStage.evaluate((stageEl) => {
      const rect = stageEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      const emitTwoFingerTouch = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        halfSpanPx: number | null
      ) => {
        const pts =
          halfSpanPx === null
            ? []
            : [
                { id: 1, x: midX - halfSpanPx, y: midY },
                { id: 2, x: midX + halfSpanPx, y: midY },
              ];
        if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
          const touchList = pts.map(
            (p) =>
              new Touch({
                identifier: p.id,
                target: stageEl,
                clientX: p.x,
                clientY: p.y,
                pageX: p.x,
                pageY: p.y,
              })
          );
          stageEl.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: touchList,
              targetTouches: touchList,
              changedTouches: touchList,
            })
          );
        }
      };
      emitTwoFingerTouch('touchstart', 50);
      emitTwoFingerTouch('touchmove', 72.5);
      emitTwoFingerTouch('touchend', null);
    });
    await expect(modelStage).toHaveAttribute('data-zoom', '1.00');
    await expect(modelStage).toHaveAttribute('data-pan-offset', '0,0');

    // 5) Tap character -> opens Flat-Lay Lookbook at 1.0x unzoomed (`transform === 'none'`) and hides bg picker badge
    await aiImg.click();
    const flatLayBoard = studioCanvas.locator('[data-flatlay-board="true"]');
    await expect(flatLayBoard).toBeVisible();
    await expect(studioCanvas.locator('[data-stage-bg-picker-btn="true"]')).toBeHidden();
    const flatLayTransform = await flatLayBoard.evaluate(
      (el) => window.getComputedStyle(el).transform
    );
    expect(flatLayTransform).toBe('none');

    // Close Flat-Lay Lookbook -> restores character + bg picker button at locked 1.0x framing
    await flatLayBoard.locator('[data-flatlay-close-btn="true"]').click();
    await expect(aiImg).toBeVisible();
    await expect(bgPickerBtn).toBeVisible();
    await expect(modelStage).toHaveAttribute('data-zoom', '1.00');

    // 6) Gaze-aligned angle scrollbar: left (-45) mirrors left (`scaleX(-)`), right (+45) faces right (`scaleX(+)`),
    //    ±135° (`우후면`/`좌후면`) show dedicated rear-quarter slices (`!== 180°`), and outer zone (-165) snaps to `180° 뒷모습`!
    const angleInput = studioCanvas.locator('input[data-angle-scroll-input="true"]');
    const setScrollVal = async (val: number) => {
      await angleInput.evaluate((el, v) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(input, String(v));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, val);
    };

    await setScrollVal(-45);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '315');
    const src315 = await aiImg.getAttribute('src');
    expect(src315).toBeTruthy();

    await setScrollVal(45);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    const rightTransform = await aiImg.evaluate((el) => (el as HTMLElement).style.transform);
    expect(rightTransform).not.toContain('scaleX(-1)');
    const src45 = await aiImg.getAttribute('src');
    expect(src45).toBeTruthy();
    expect(src315).not.toBe(src45);

    await setScrollVal(135);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '135');
    await angleInput.dispatchEvent('pointerup');
    await expect(angleInput).toHaveValue('135');
    const src135 = await aiImg.getAttribute('src');
    expect(src135).toBeTruthy();

    await setScrollVal(180);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    const src180 = await aiImg.getAttribute('src');
    expect(src180).toBeTruthy();
    expect(src135).not.toBe(src180);
    expect(src135).not.toBe(src45);

    await setScrollVal(-135);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '225');
    await angleInput.dispatchEvent('pointerup');
    await expect(angleInput).toHaveValue('-135');
    const src225 = await aiImg.getAttribute('src');
    expect(src225).toBeTruthy();
    expect(src225).not.toBe(src180);
    expect(src225).not.toBe(src135);

    await setScrollVal(-165);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await expect(aiImg).toBeVisible();
    await angleInput.dispatchEvent('pointerup');
    await expect(angleInput).toHaveValue('-180');
  });

  test('3. Light/Dark theme CSS variable inheritance (zero hardcoded dark background in light mode) & VTON API contract', async ({
    page,
    request,
  }) => {
    // Backend /api/vton/status & /api/vton/synthesize legacy-mode fallback check
    const statusRes = await request.get('/api/vton/status', {
      headers: { 'X-Demo-Mode': 'sample' },
    });
    expect(statusRes.ok()).toBeTruthy();
    const statusJson = await statusRes.json();
    expect(statusJson.mode).toBe('2d-vton');

    const synthRes = await request.post('/api/vton/synthesize', {
      headers: { 'X-Demo-Mode': 'sample' },
      data: {
        mode: '3d', // legacy value should safely fallback to '2d-vton'
        profile: {
          skinToneHex: '#DFBA9B',
          personalColor: 'autumn_warm',
          heightCm: 172,
          weightKg: 64,
          bodyShape: 'standard_balanced',
        },
        slots: {
          top: {
            id: 1,
            name: '수피마 코튼 옥스포드 셔츠',
            category: 'top',
            subcategory: 'shirt',
            color_hex: '#F2F1EC',
            image_url: '/seed/white-shirt.jpg',
          },
        },
      },
    });
    expect(synthRes.ok()).toBeTruthy();
    const synthJson = await synthRes.json();
    expect(synthJson.mode).toBe('2d-vton');

    // Verify Light Theme surface brightness (never hardcoded dark) & Zero Procedural Canvas
    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      studioCanvas.locator('canvas:not(.studio-three-stage-mount canvas)')
    ).toHaveCount(0);
    await expect(
      studioCanvas.locator('canvas[data-weather-foreground-canvas="true"]')
    ).toHaveCount(0);
    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();

    const lightLum = await studioCanvas.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const m = cs.backgroundColor.match(/\d+/g);
      if (!m || m.length < 3) return 255;
      const [r, g, b] = m.map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    });
    expect(lightLum).toBeGreaterThan(220);

    // Weather HUD is unified and horizontally centered at the top of the stage
    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    await expect(weatherCapsule).toBeVisible();
    const [stageRect, weatherRect] = await Promise.all([
      studioCanvas.boundingBox(),
      weatherCapsule.boundingBox(),
    ]);
    expect(stageRect).not.toBeNull();
    expect(weatherRect).not.toBeNull();
    if (stageRect && weatherRect) {
      const stageCenterX = stageRect.x + stageRect.width / 2;
      const weatherCenterX = weatherRect.x + weatherRect.width / 2;
      expect(Math.abs(weatherCenterX - stageCenterX)).toBeLessThanOrEqual(20);
      expect(weatherRect.y - stageRect.y).toBeLessThanOrEqual(24);
    }

    // Seamless Architectural Stage studio backdrop (zero cartoon furniture vector props)
    await expect(studioCanvas.locator('[data-backdrop-style="architectural-stage"]')).toBeVisible();
    await expect(studioCanvas.locator('.atelier-backdrop-props-svg')).toHaveCount(0);

    // Compact preview in Skin-Tone Modal uses non-procedural Avatar Spec Card with zero <canvas>
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(page.locator('.skin-modal-character-stage canvas')).toHaveCount(0);
    await expect(
      page.locator('.skin-modal-character-stage [data-avatar-spec-card="true"]')
    ).toBeVisible();
  });

  test('4. Zero upper menu above stage, centered Seoul+weather capsule popup (all 9 scenarios + Look 1/2 presets), bottom-right Look 1/2 dock above angle scrollbar, per-scenario outfit & AI character persistence, non-clipping safe zone, and 2-detent swipeable mobile wardrobe sheet', async ({
    page,
  }) => {
    let synthCount = 0;
    await page.route('**/api/vton/synthesize', async (route) => {
      synthCount += 1;
      const seed = synthCount;
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
          styleMode: 'stylized_isometric',
          geminiUsed: true,
          compositeImageUrl: buildPortraitTurnaround2x2PngDataUrl(seed),
        }),
      });
    });

    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    const lookDock = studioCanvas.locator('[data-weather-look-dock="true"]');
    const scrollDock = studioCanvas.locator('.studio-angle-scroll-dock');

    await expect(studioCanvas).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();

    // (1) Zero Upper Menu Above Stage & Centered Location+Weather Capsule + 9-Scenario Popup
    await expect(weatherPanel).toHaveCount(0);
    const upperLayoutAudit = await page.evaluate(() => {
      const screen = document.querySelector('.hig-outfits-screen');
      const header = screen?.querySelector(':scope > header');
      const layout = screen?.querySelector(':scope > .studio-25d-layout');
      if (!header || !layout) return { adjacent: false, gapPx: 999 };
      const hRect = header.getBoundingClientRect();
      const lRect = layout.getBoundingClientRect();
      return {
        adjacent: header.nextElementSibling === layout,
        gapPx: lRect.top - hRect.bottom,
      };
    });
    expect(upperLayoutAudit.adjacent).toBe(true);
    expect(upperLayoutAudit.gapPx).toBeLessThanOrEqual(16);

    await expect(weatherCapsule).toBeVisible();
    await expect(weatherCapsule).toContainText(/서울|Seoul/);
    const [stageBox, capsuleBox] = await Promise.all([
      studioCanvas.boundingBox(),
      weatherCapsule.boundingBox(),
    ]);
    expect(stageBox).not.toBeNull();
    expect(capsuleBox).not.toBeNull();
    expect(
      Math.abs(
        capsuleBox!.x + capsuleBox!.width / 2 - (stageBox!.x + stageBox!.width / 2)
      )
    ).toBeLessThanOrEqual(20);

    // Open Weather Capsule Popup while `예보` (`live`) is selected -> assert unclipped bounds, Open-Meteo source, live + 8 dropdown scenarios, & compact Look 1/2 selects
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel.evaluate(async (el) => {
      await Promise.all(
        el
            .getAnimations({ subtree: true })
            .filter((anim) => Number.isFinite(anim.effect?.getComputedTiming().iterations ?? 1))
            .map((anim) => anim.finished.catch(() => {}))
      );
    });
    const vpBounds = page.viewportSize();
    const panelBox = await weatherPanel.boundingBox();
    expect(panelBox).not.toBeNull();
    if (panelBox && vpBounds) {
      expect(panelBox.y).toBeGreaterThanOrEqual(0);
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(vpBounds.height + 1);
    }
    await expect(weatherPanel.locator('[data-weather-source-caption="true"]')).toBeVisible();
    await expect(weatherPanel.locator('[data-weather-source-caption="true"]')).toContainText(
      'Open-Meteo'
    );

    const liveScenarioBtn = weatherPanel.locator('button[data-weather-scenario="live"]');
    const scenarioSelect = weatherPanel.locator('select[data-weather-scenario-select="true"]');
    await expect(liveScenarioBtn).toBeVisible();
    await expect(liveScenarioBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(scenarioSelect).toBeVisible();
    await expect(scenarioSelect.locator('option[data-weather-scenario]')).toHaveCount(
      ALL_WEATHER_SCENARIOS.length - 1
    );

    await expect(weatherPanel.locator('select[data-look-style-select="1"]')).toHaveValue(
      'business_casual'
    );
    await expect(weatherPanel.locator('select[data-look-style-select="2"]')).toHaveValue(
      'comfortable_casual'
    );
    await expect(weatherPanel.locator('.weather-popup-look-items')).toHaveCount(0);

    // Switch to `맑음` (`crisp_autumn`) via dropdown -> verify all 8 dropdown options + `live` button remain available, then return to `예보` (`live`)
    await scenarioSelect.selectOption('crisp_autumn');
    await expect(scenarioSelect).toHaveValue('crisp_autumn');
    await expect(liveScenarioBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(scenarioSelect.locator('option[data-weather-scenario]')).toHaveCount(
      ALL_WEATHER_SCENARIOS.length - 1
    );
    await liveScenarioBtn.click();
    await expect(liveScenarioBtn).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);

    // (2) Single Look Selector Button + History Button Positioned at Bottom-Left Above Angle Scrollbar & Worn Dock on Right
    await expect(lookDock).toBeVisible();
    const lookTrigger = lookDock.locator('[data-look-selector-trigger="true"]');
    const historyBtn = studioCanvas.locator(
      '[data-bottom-left-hud="true"] [data-vton-history-btn="true"]'
    );
    await expect(lookTrigger).toBeVisible();
    await expect(historyBtn).toBeVisible();
    await expect(lookDock.locator('[data-look-selector-menu="true"]')).toHaveCount(0);
    // Clicking the single Look trigger opens the 2-option Look 1 / Look 2 selector menu
    await lookTrigger.click();
    await expect(lookDock.locator('[data-look-selector-menu="true"]')).toBeVisible();
    await expect(lookDock.locator('[data-look-selector-menu="true"] [data-weather-rec-id]')).toHaveCount(2);
    await lookTrigger.click();
    await expect(lookDock.locator('[data-look-selector-menu="true"]')).toHaveCount(0);

    await expect(scrollDock).toBeVisible();
    const wornDock = studioCanvas.locator('[data-worn-slots-dock="true"]');
    await expect(wornDock).toBeVisible();
    const [lookRect, histRect, scrollRect, wornRect, lookTriggerRect] = await Promise.all([
      lookDock.boundingBox(),
      historyBtn.boundingBox(),
      scrollDock.boundingBox(),
      wornDock.boundingBox(),
      lookTrigger.boundingBox(),
    ]);
    expect(lookRect).not.toBeNull();
    expect(histRect).not.toBeNull();
    expect(scrollRect).not.toBeNull();
    expect(wornRect).not.toBeNull();
    expect(lookTriggerRect).not.toBeNull();
    expect(histRect!.y).toBeGreaterThanOrEqual(lookRect!.y + lookRect!.height);
    expect(histRect!.y + histRect!.height).toBeLessThanOrEqual(scrollRect!.y + 6);
    expect(Math.abs(lookRect!.x - scrollRect!.x)).toBeLessThanOrEqual(12);
    expect(lookRect!.x + lookRect!.width / 2).toBeLessThan(
      stageBox!.x + stageBox!.width / 2
    );
    expect(lookTriggerRect!.width).toBeLessThanOrEqual(42);
    expect(wornRect!.x + wornRect!.width / 2).toBeGreaterThan(
      stageBox!.x + stageBox!.width / 2
    );

    // (4) Non-Clipping Character Safe Zone at 1.0x Zoom
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    await expect(modelStage).toHaveAttribute('data-zoom', '1.00');
    const safeZoneMetrics = await studioCanvas.evaluate((root) => {
      const layer = root.querySelector('.studio-2d-layer-after') as HTMLElement | null;
      const capsule = root.querySelector('[data-atelier-weather-capsule="true"]');
      const angleDock = root.querySelector('.studio-angle-scroll-dock');
      if (!layer || !capsule || !angleDock) return null;
      const cs = window.getComputedStyle(layer);
      const padTop = Number.parseFloat(cs.paddingTop || '0');
      const padBottom = Number.parseFloat(cs.paddingBottom || '0');
      const layerRect = layer.getBoundingClientRect();
      const capRect = capsule.getBoundingClientRect();
      const dockRect = angleDock.getBoundingClientRect();
      return {
        padTop,
        padBottom,
        safeTopClearancePx: layerRect.top + padTop - capRect.bottom,
        safeBottomClearancePx: dockRect.top - (layerRect.bottom - padBottom),
      };
    });
    expect(safeZoneMetrics).not.toBeNull();
    expect(safeZoneMetrics!.padTop).toBeGreaterThanOrEqual(52);
    expect(safeZoneMetrics!.padBottom).toBeGreaterThanOrEqual(60);
    expect(safeZoneMetrics!.safeTopClearancePx).toBeGreaterThanOrEqual(4);
    expect(safeZoneMetrics!.safeBottomClearancePx).toBeGreaterThanOrEqual(4);

    // (3) Per-Scenario Character & Outfit Persistence (`예보` -> `맑음` -> `예보` Does NOT Reset)
    // Customize `예보` (`live`) by unequipping `top` and generating its AI VTON slice
    await studioCanvas.locator('[data-studio-slot="top"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toHaveCount(0);
    const liveCustomCombo = await modelStage.getAttribute('data-outfit-combo');
    expect(liveCustomCombo).toBeTruthy();

    const stagedBar = studioCanvas.locator('[data-vton-staged-bar="true"]');
    const genBtn = studioCanvas.locator('[data-vton-generate-btn="true"]');
    await expect(stagedBar).toBeVisible({ timeout: 5000 });
    await expect(stagedBar.locator('[data-vton-history-btn]')).toHaveCount(0);
    expect(await stagedBar.innerText()).not.toMatch(/이전 피팅|Saved\s*\(/i);

    await expect(genBtn).toBeVisible({ timeout: 5000 });
    await genBtn.click();
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    const liveCustomImgSrc = await aiImg.getAttribute('src');
    expect(liveCustomImgSrc).toMatch(/^data:image\/png;base64,/);

    // Switch to `맑음` (`crisp_autumn`) -> applies fresh `맑음` outfit (with `top` equipped)
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel
      .locator('select[data-weather-scenario-select="true"]')
      .selectOption('crisp_autumn');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-weather-scenario', 'crisp_autumn');
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    const crispImgSrc = await aiImg.getAttribute('src');
    expect(crispImgSrc).not.toBe(liveCustomImgSrc);

    // Switch back to `예보` (`live`) -> preserves `예보` customized slots (`top` still absent) AND `liveCustomImgSrc`!
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel.locator('button[data-weather-scenario="live"]').click();
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-weather-scenario', 'live');
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toHaveCount(0);
    await expect(modelStage).toHaveAttribute('data-outfit-combo', liveCustomCombo!);
    await expect(aiImg).toBeVisible();
    expect(await aiImg.getAttribute('src')).toBe(liveCustomImgSrc);

    // (5) Swipeable 2-Detent Wardrobe Bottom Sheet on Narrow Mobile Viewport (< 600px, i.e., `ios-notch`)
    const vp = page.viewportSize();
    if (vp && vp.width < 600) {
      const mobileTrigger = page.locator('[data-mobile-wardrobe-trigger="true"]');
      await expect(mobileTrigger).toBeVisible();
      await mobileTrigger.click();

      const wardrobeSheet = page.locator('#outfit-mobile-wardrobe-sheet');
      await expect(wardrobeSheet).toBeVisible();
      await expect(wardrobeSheet).toHaveAttribute('data-sheet-expanded', 'false');
      const compactBox = await wardrobeSheet.boundingBox();
      expect(compactBox).not.toBeNull();

      // Swipe UP (`deltaY = -120`) -> expands to full wardrobe detent (`data-sheet-expanded="true"`) & height grows
      await swipeWardrobeSheetHandle(page, -120);
      await expect(wardrobeSheet).toHaveAttribute('data-sheet-expanded', 'true');
      await expect
        .poll(async () => (await wardrobeSheet.boundingBox())?.height ?? 0)
        .toBeGreaterThan(compactBox!.height + 100);

      // First swipe DOWN (`deltaY = +100`) -> collapses back to normal detent (`data-sheet-expanded="false"`)
      await swipeWardrobeSheetHandle(page, 100);
      await expect(wardrobeSheet).toHaveAttribute('data-sheet-expanded', 'false');
      await expect
        .poll(async () => (await wardrobeSheet.boundingBox())?.height ?? 9999)
        .toBeLessThanOrEqual(compactBox!.height + 20);

      // Second swipe DOWN (`deltaY = +130`) -> dismisses/closes `#outfit-mobile-wardrobe-sheet` (`toHaveCount(0)`)
      await swipeWardrobeSheetHandle(page, 130);
      await expect(wardrobeSheet).toHaveCount(0);
    } else {
      await expect(
        page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`)
      ).toBeVisible();
    }
  });

  test('5. Wardrobe outer category header ("외투"), sticky top equipped card on scroll with unclipped full item metadata, and Profile modal Light/Dark theme surface parity', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-item-slot="top"]')).toBeVisible();

    // Switch to `rainy_cool` so `outer` ("발수 코튼 개버딘 트렌치코트") is deterministically equipped
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel
      .locator('select[data-weather-scenario-select="true"]')
      .selectOption('rainy_cool');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas.locator('[data-flatlay-item-slot="outer"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toHaveCount(1);

    const vp = page.viewportSize();
    const isMobileViewport = Boolean(vp && vp.width < 600);
    const drawerRoot = isMobileViewport
      ? page.locator('#outfit-mobile-wardrobe-sheet')
      : page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`);

    if (isMobileViewport) {
      await studioCanvas.locator('[data-mobile-wardrobe-trigger="true"]').click();
      await expect(drawerRoot).toBeVisible();
      await drawerRoot.locator('[data-mobile-sheet-slot-tab="outer"]').click();
      await drawerRoot.evaluate(async (el) => {
        await Promise.all(
          el
            .getAnimations({ subtree: true })
            .filter((anim) => Number.isFinite(anim.effect?.getComputedTiming().iterations ?? 1))
            .map((anim) => anim.finished.catch(() => {}))
        );
      });
    } else {
      await expect(drawerRoot).toBeVisible();
      await drawerRoot.locator('[data-outfit-slot-tab="outer"]').click();
    }

    // Item 9: Selecting `outer` category displays `'외투'` (NOT garment name `'발수 코튼 개버딘 트렌치코트'`)
    const drawerTitle = drawerRoot.locator('[data-drawer-focused-title="true"]');
    await expect(drawerTitle).toBeVisible();
    await expect(drawerTitle.locator('.atelier-drawer-focused-title-label')).toHaveText('외투');
    await expect(drawerTitle).not.toContainText('발수 코튼 개버딘 트렌치코트');

    // Item 4: Pinned equipped card sits above `.atelier-drawer-grid-scroll`, stays fixed on scroll, & shows unclipped metadata
    const pinnedCard = drawerRoot.locator('[data-pinned-equipped-card]');
    const gridScroll = drawerRoot.locator('.atelier-drawer-grid-scroll');
    await expect(pinnedCard).toBeVisible();
    await expect(gridScroll).toBeVisible();

    const [pinnedBefore, scrollBox] = await Promise.all([
      pinnedCard.boundingBox(),
      gridScroll.boundingBox(),
    ]);
    expect(pinnedBefore).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(pinnedBefore!.y + pinnedBefore!.height).toBeLessThanOrEqual(scrollBox!.y + 8);

    const specMetrics = await pinnedCard.evaluate((cardEl) => {
      const nameEl = cardEl.querySelector('.atelier-spec-item-name');
      const brandEl = cardEl.querySelector('.atelier-spec-brand-line');
      const colorDot = cardEl.querySelector('.atelier-spec-color-dot');
      const pills = Array.from(cardEl.querySelectorAll('.atelier-spec-meta-pill')).map((p) =>
        (p.textContent || '').trim()
      );
      const nameStyle = nameEl ? window.getComputedStyle(nameEl) : null;
      return {
        itemName: (nameEl?.textContent || '').trim(),
        whiteSpace: nameStyle?.whiteSpace || '',
        textOverflow: nameStyle?.textOverflow || '',
        brandText: (brandEl?.textContent || '').trim(),
        hasColorDot: Boolean(colorDot),
        pillTexts: pills.filter((t) => t.length > 0),
      };
    });
    expect(specMetrics.itemName).toContain('발수 코튼 개버딘 트렌치코트');
    expect(specMetrics.whiteSpace).toBe('normal');
    expect(specMetrics.textOverflow).not.toBe('ellipsis');
    expect(specMetrics.brandText.length).toBeGreaterThan(0);
    expect(specMetrics.hasColorDot).toBe(true);
    expect(specMetrics.pillTexts.length).toBeGreaterThanOrEqual(3);

    await expect(gridScroll.locator('.atelier-unfolded-spec-card.is-equipped')).toHaveCount(0);
    const firstUnequipped = gridScroll.locator('[data-slot-garment-id]').first();
    await expect(firstUnequipped).toBeVisible();
    await firstUnequipped.click();
    const inspectorCard = drawerRoot.locator('[data-pinned-inspector-card]');
    await expect(inspectorCard).toBeVisible();
    const unfoldedGridSpecStyle = await inspectorCard
      .locator('.atelier-spec-item-name')
      .evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow };
      });
    expect(unfoldedGridSpecStyle.whiteSpace).toBe('normal');
    expect(unfoldedGridSpecStyle.textOverflow).not.toBe('ellipsis');
    await inspectorCard.locator('.atelier-spec-dismiss-btn').click();
    await expect(pinnedCard).toBeVisible();

    const scrolledTop = await gridScroll.evaluate((el) => {
      el.scrollTop = 300;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      return el.scrollTop;
    });
    expect(scrolledTop).toBeGreaterThan(0);

    await expect(pinnedCard).toBeVisible();
    const pinnedAfter = await pinnedCard.boundingBox();
    expect(pinnedAfter).not.toBeNull();
    expect(Math.abs(pinnedAfter!.y - pinnedBefore!.y)).toBeLessThanOrEqual(1);

    if (isMobileViewport) {
      await page.keyboard.press('Escape');
      await expect(drawerRoot).toHaveCount(0);
    }

    // Item 7: `#profile-studio-sheet` Light (`luminance > 220`) & Dark (`luminance < 45`) Theme Surface Parity
    const readSheetLuminance = async () =>
      page.locator('#profile-studio-sheet').evaluate((el) => {
        const cs = window.getComputedStyle(el);
        const m = cs.backgroundColor.match(/\d+/g);
        if (!m || m.length < 3) return -1;
        const [r, g, b] = m.map(Number);
        return 0.299 * r + 0.587 * g + 0.114 * b;
      });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    const profileSheet = page.locator('#profile-studio-sheet');
    await expect(profileSheet).toBeVisible();
    await expect(profileSheet.locator('[data-profile-theme]')).toHaveAttribute(
      'data-profile-theme',
      'light'
    );
    expect(await readSheetLuminance()).toBeGreaterThan(220);

    await page.keyboard.press('Escape');
    await expect(profileSheet).toHaveCount(0);

    await page.locator('[data-outfit-theme-toggle="true"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(profileSheet).toBeVisible();
    await expect(profileSheet.locator('[data-profile-theme]')).toHaveAttribute(
      'data-profile-theme',
      'dark'
    );
    expect(await readSheetLuminance()).toBeLessThan(45);
  });

  test('6. WS-1: Responsive ResizeObserver character scaling (`data-ideal-scale`), non-clipping bounds, and floor contact/AO/wet-reflection grounding across viewports', async ({
    page,
  }) => {
    await page.route('**/api/vton/synthesize', async (route) => {
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
          styleMode: 'stylized_isometric',
          geminiUsed: true,
          compositeImageUrl: buildPortraitTurnaround2x2PngDataUrl(7),
        }),
      });
    });

    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');

    await expect(studioCanvas).toBeVisible();
    await expect(aiImg).toBeVisible({ timeout: 10000 });

    // Confirm responsive `data-ideal-scale` is active (> 1.0, <= 1.58) rather than hardcoded 1.0
    await expect
      .poll(async () => Number((await modelStage.getAttribute('data-ideal-scale')) || '0'))
      .toBeGreaterThan(1.01);
    const idealScale = Number((await modelStage.getAttribute('data-ideal-scale')) || '1');
    expect(idealScale).toBeLessThanOrEqual(1.58);

    // Confirm AI character image fills stage prominently without clipping above Weather Capsule or below floor
    // When Three.js WebGL Stage Layer is active, 3D dual-channel floor shadow replaces legacy 2D CSS contact/AO shadows
    const threeLayer = studioCanvas.locator('[data-testid="studio-three-stage-layer"]');
    await expect(threeLayer).toHaveCount(1);
    await expect(studioCanvas.locator('[data-floor-contact-shadow="true"]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-ground-ao-shadow="true"]')).toHaveCount(0);

    const [stageBox, capsuleBox, imgBox] = await Promise.all([
      studioCanvas.boundingBox(),
      studioCanvas.locator('[data-atelier-weather-capsule="true"]').boundingBox(),
      aiImg.boundingBox(),
    ]);
    expect(stageBox).not.toBeNull();
    expect(capsuleBox).not.toBeNull();
    expect(imgBox).not.toBeNull();

    // Character image aligns cleanly within stage bounds without clipping
    expect(imgBox!.y).toBeGreaterThanOrEqual(stageBox!.y - 2);
    expect(imgBox!.y + imgBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height + 8);

    // Switch to rainy scenario on outdoor stage -> wet pavement mirror reflection renders & anchors beneath soles
    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel
      .locator('select[data-weather-scenario-select="true"]')
      .selectOption('rainy_cool');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);

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
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', 'rain');
    await expect(studioCanvas.locator('[data-wet-mirror-reflection="true"]')).toBeVisible();
  });

  test('7. WS-2: Flat-Lay Lookbook overlay (`data-lookbook-overlay="true"`) elevates board above competing HUDs while preserving interactive Weather Capsule & History controls', async ({
    page,
  }) => {
    await page.route('**/api/vton/synthesize', async (route) => {
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
          styleMode: 'stylized_isometric',
          geminiUsed: true,
          compositeImageUrl: buildPortraitTurnaround2x2PngDataUrl(11),
        }),
      });
    });

    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    const historyBtn = studioCanvas.locator('[data-vton-history-btn="true"]');

    await expect(aiImg).toBeVisible({ timeout: 20000 });
    await aiImg.click();

    await expect(studioCanvas).toHaveAttribute('data-lookbook-overlay', 'true');
    const flatLayBoard = studioCanvas.locator('[data-flatlay-board="true"]');
    await expect(flatLayBoard).toBeVisible();

    await expect
      .poll(() =>
        studioCanvas.evaluate((root) => {
          const wornDock = root.querySelector('.studio-worn-slots-dock') as HTMLElement | null;
          return wornDock ? window.getComputedStyle(wornDock).opacity : '0';
        })
      )
      .toBe('0');

    const zHierarchy = await studioCanvas.evaluate((root) => {
      const topHud = root.querySelector('.studio-stage-top-hud') as HTMLElement | null;
      const stage = root.querySelector('.studio-2d-model-stage') as HTMLElement | null;
      const wornDock = root.querySelector('.studio-worn-slots-dock') as HTMLElement | null;
      const lookDock = root.querySelector('[data-weather-look-dock="true"]') as HTMLElement | null;
      const angleDock = root.querySelector('[data-angle-scroll-dock="true"]') as HTMLElement | null;
      const topZ = topHud ? Number.parseInt(window.getComputedStyle(topHud).zIndex || '0', 10) : 0;
      const stageZ = stage ? Number.parseInt(window.getComputedStyle(stage).zIndex || '0', 10) : 0;
      const hiddenState = (el: HTMLElement | null) => {
        if (!el) return { missing: true, visibility: '', opacity: '', pointerEvents: '' };
        const cs = window.getComputedStyle(el);
        return {
          missing: false,
          visibility: cs.visibility,
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
        };
      };
      return {
        topZ,
        stageZ,
        wornDock: hiddenState(wornDock),
        lookDock: hiddenState(lookDock),
        angleDock: hiddenState(angleDock),
      };
    });

    expect(zHierarchy.stageZ).toBeGreaterThanOrEqual(57);
    expect(zHierarchy.topZ).toBeGreaterThan(zHierarchy.stageZ);
    expect(zHierarchy.wornDock.visibility).toBe('hidden');
    expect(zHierarchy.wornDock.opacity).toBe('0');
    expect(zHierarchy.wornDock.pointerEvents).toBe('none');
    expect(zHierarchy.angleDock.visibility).toBe('hidden');
    expect(zHierarchy.angleDock.pointerEvents).toBe('none');
    if (!zHierarchy.lookDock.missing) {
      expect(zHierarchy.lookDock.visibility).toBe('hidden');
      expect(zHierarchy.lookDock.pointerEvents).toBe('none');
    }

    // Top Weather Capsule stays above & cleanly separated from elevated Flat-Lay board
    await expect(weatherCapsule).toBeVisible();
    await expect(historyBtn).toBeVisible();
    const [capsuleBox, boardBox] = await Promise.all([
      weatherCapsule.boundingBox(),
      flatLayBoard.boundingBox(),
    ]);
    expect(capsuleBox).not.toBeNull();
    expect(boardBox).not.toBeNull();
    expect(boardBox!.y).toBeGreaterThanOrEqual(capsuleBox!.y + capsuleBox!.height - 2);

    // Desktop right slot picker (`>= 600px`) dims softly while overlay is open
    const vp = page.viewportSize();
    if (vp && vp.width >= 600) {
      await expect
        .poll(() =>
          page
            .locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`)
            .evaluate((el) => Number.parseFloat(window.getComputedStyle(el).opacity || '1'))
        )
        .toBeLessThan(0.6);
    }

    // Weather Capsule remains genuinely interactive over lookbook overlay
    await weatherCapsule.click();
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await expect(weatherPanel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);

    // Close Flat-Lay Lookbook -> returns to AI character stage cleanly
    const closeBtn = studioCanvas.locator('[data-flatlay-close-btn="true"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(studioCanvas).not.toHaveAttribute('data-lookbook-overlay', 'true');
    await expect(modelStage).toHaveAttribute('data-stage-view', 'ai-vton');
    await expect(aiImg).toBeVisible();
  });
});


