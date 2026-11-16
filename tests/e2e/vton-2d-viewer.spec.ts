import { expect, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

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
    //    and outer zone (-145) snaps cleanly to `180° 뒷모습` without dropping to Flat-Lay!
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

    await setScrollVal(-145);
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

    // Compact preview in Skin-Tone Modal uses non-procedural Avatar Spec Card with zero <canvas>
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(page.locator('.skin-modal-character-stage canvas')).toHaveCount(0);
    await expect(
      page.locator('.skin-modal-character-stage [data-avatar-spec-card="true"]')
    ).toBeVisible();
  });
});
