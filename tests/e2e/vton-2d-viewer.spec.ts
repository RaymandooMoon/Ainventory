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
      if (localY >= 18 && localY <= 128 && localX >= 30 && localX <= 66) {
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

    // Worn slot chips must remain accessible alongside the 2D try-on model
    await expect(studioCanvas.locator('[data-studio-slot]').first()).toBeVisible();

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
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-loading'), { timeout: 15000 })
      .not.toBe('true');

    // 1) Split Flat-Lay button (`[data-vton-compare-btn]`) is permanently removed,
    //    and zoom controls do NOT appear while fallback Flat-Lay is displayed
    await expect(studioCanvas.locator('[data-vton-compare-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);

    // 2) Left worn-slots dock is unclipped, pointer-interactive, and vertically scrollable
    const wornDock = studioCanvas.locator('[data-worn-slots-dock="true"]');
    await expect(wornDock).toBeVisible();
    const dockMetrics = await wornDock.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const chips = Array.from(el.querySelectorAll('.studio-worn-slot-chip')).map((c) =>
        c.getBoundingClientRect()
      );
      return {
        overflowY: cs.overflowY,
        pointerEvents: cs.pointerEvents,
        minChipHeight: chips.length > 0 ? Math.min(...chips.map((r) => r.height)) : 0,
      };
    });
    expect(dockMetrics.overflowY).toBe('auto');
    expect(dockMetrics.pointerEvents).toBe('auto');
    expect(dockMetrics.minChipHeight).toBeGreaterThanOrEqual(40);

    // 3) Load 4-angle AI Showcase Character -> verify device-ideal 1.0x scale & exact 50% horizontal dead-center
    await page.goto('/outfits?demo_vton=1');
    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible();
    await expect(studioCanvas.locator('[data-vton-compare-btn]')).toHaveCount(0);

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

    // 4) Zoom in (`1.8x`), pan character off-center, release -> auto-recenters to `0,0` after ~1s!
    const zoomInBtn = studioCanvas.locator('[data-vton-zoom-in]');
    const zoomLevelBtn = studioCanvas.locator('[data-vton-zoom-level]');
    await expect(zoomInBtn).toBeVisible();
    await expect(zoomLevelBtn).toContainText('1.0');

    await zoomInBtn.click();
    await expect(zoomLevelBtn).not.toContainText('1.0');

    const stageBox = await modelStage.boundingBox();
    expect(stageBox).toBeTruthy();
    const cx = Math.round(stageBox!.x + stageBox!.width * 0.52);
    const cy = Math.round(stageBox!.y + stageBox!.height * 0.56);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 48, cy + 24, { steps: 4 });
    await page.mouse.up();

    await expect(modelStage).not.toHaveAttribute('data-pan-offset', '0,0');
    // Wait ~1.1s -> character automatically aligns back to dead-center (`0,0`)!
    await expect
      .poll(async () => modelStage.getAttribute('data-pan-offset'), { timeout: 3000 })
      .toBe('0,0');

    // 5) Tap zoomed character -> opens Flat-Lay Lookbook at 1.0x unzoomed (`transform === 'none'`) and hides zoom bar
    await aiImg.click();
    const flatLayBoard = studioCanvas.locator('[data-flatlay-board="true"]');
    await expect(flatLayBoard).toBeVisible();
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);
    const flatLayTransform = await flatLayBoard.evaluate(
      (el) => window.getComputedStyle(el).transform
    );
    expect(flatLayTransform).toBe('none');

    // Close Flat-Lay Lookbook -> returns to character & reset zoom to 1.0x
    await flatLayBoard.locator('[data-flatlay-close-btn="true"]').click();
    await expect(aiImg).toBeVisible();
    await zoomLevelBtn.click();
    await expect(zoomLevelBtn).toContainText('1.0');

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
    const leftTransform = await aiImg.evaluate((el) => (el as HTMLElement).style.transform);
    expect(leftTransform).toContain('scaleX(-1)');

    await setScrollVal(45);
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    const rightTransform = await aiImg.evaluate((el) => (el as HTMLElement).style.transform);
    expect(rightTransform).not.toContain('scaleX(-1)');
    const src45 = await aiImg.getAttribute('src');

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
      studioCanvas.locator('canvas:not([data-weather-foreground-canvas="true"])')
    ).toHaveCount(0);
    await expect(
      studioCanvas.locator('canvas[data-weather-foreground-canvas="true"]')
    ).toHaveCSS('pointer-events', 'none');
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

    // Seamless Infinity-Cove Cyclorama studio backdrop (zero cartoon furniture vector props)
    await expect(studioCanvas.locator('[data-backdrop-style="infinity-cyclorama"]')).toBeVisible();
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

    // Open Weather Capsule Popup while `예보` (`live`) is selected -> assert all 9 scenarios + Look 1 & Look 2 presets
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await expect(weatherPanel.locator('[data-weather-scenario]')).toHaveCount(9);
    for (const scKey of ALL_WEATHER_SCENARIOS) {
      await expect(weatherPanel.locator(`[data-weather-scenario="${scKey}"]`)).toBeVisible();
    }
    await expect(weatherPanel.locator('[data-weather-scenario="live"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(weatherPanel.locator('[data-weather-look-card="1"]')).toContainText(
      /비즈니스 캐주얼|Business Casual/
    );
    await expect(weatherPanel.locator('[data-weather-look-card="2"]')).toContainText(
      /편한 캐주얼|Comfortable Casual/
    );

    // Switch to `맑음` (`crisp_autumn`) -> verify all 9 scenarios remain rendered when `맑음` is active, then return to `예보` (`live`)
    await weatherPanel.locator('[data-weather-scenario="crisp_autumn"]').click();
    await expect(weatherPanel.locator('[data-weather-scenario="crisp_autumn"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(weatherPanel.locator('[data-weather-scenario]')).toHaveCount(9);
    for (const scKey of ALL_WEATHER_SCENARIOS) {
      await expect(weatherPanel.locator(`[data-weather-scenario="${scKey}"]`)).toBeVisible();
    }
    await weatherPanel.locator('[data-weather-scenario="live"]').click();
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);

    // (2) `Look 1` / `Look 2` Dock Positioned Immediately Above Bottom-Right of Angle Scrollbar
    await expect(lookDock).toBeVisible();
    await expect(lookDock.locator('[data-weather-rec-id]')).toHaveCount(2);
    await expect(scrollDock).toBeVisible();
    const [lookRect, scrollRect] = await Promise.all([
      lookDock.boundingBox(),
      scrollDock.boundingBox(),
    ]);
    expect(lookRect).not.toBeNull();
    expect(scrollRect).not.toBeNull();
    expect(lookRect!.y + lookRect!.height).toBeLessThanOrEqual(scrollRect!.y + 6);
    expect(
      Math.abs(lookRect!.x + lookRect!.width - (scrollRect!.x + scrollRect!.width))
    ).toBeLessThanOrEqual(12);
    expect(lookRect!.x + lookRect!.width / 2).toBeGreaterThan(
      stageBox!.x + stageBox!.width / 2
    );

    // (4) Non-Clipping Character Safe Zone at 1.0x Zoom
    const aiImg = studioCanvas.locator('.editorial-ai-vton-img');
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

    const genBtn = studioCanvas.locator('[data-vton-generate-btn="true"]');
    if (await genBtn.isVisible()) {
      await genBtn.click();
    }
    await expect(aiImg).toBeVisible({ timeout: 10000 });
    const liveCustomImgSrc = await aiImg.getAttribute('src');
    expect(liveCustomImgSrc).toMatch(/^data:image\/png;base64,/);

    // Switch to `맑음` (`crisp_autumn`) -> applies fresh `맑음` outfit (with `top` equipped)
    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel.locator('[data-weather-scenario="crisp_autumn"]').click();
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
    await weatherPanel.locator('[data-weather-scenario="live"]').click();
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
});

