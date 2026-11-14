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

  test('2. Outfit combination synthesis, local combo caching, Zoom controls, and Before/After split comparison', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // Wait for initial 2D VTON outfit synthesis to settle
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-loading'), { timeout: 15000 })
      .not.toBe('true');

    // Zoom controls: zoom in -> verify > 1.0x -> reset to 1.0x
    const zoomInBtn = studioCanvas.locator('[data-vton-zoom-in]');
    const zoomLevelBtn = studioCanvas.locator('[data-vton-zoom-level]');
    await expect(zoomInBtn).toBeVisible();
    await expect(zoomLevelBtn).toContainText('1.0');

    await zoomInBtn.click();
    await expect(zoomLevelBtn).not.toContainText('1.0');

    await zoomLevelBtn.click();
    await expect(zoomLevelBtn).toContainText('1.0');

    // Before / After split comparison view
    const compareBtn = studioCanvas.locator('[data-vton-compare-btn]');
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'true');

    const splitSlider = studioCanvas.locator('[role="slider"]');
    await expect(splitSlider).toBeVisible();
    await splitSlider.focus();
    await page.keyboard.press('ArrowRight');

    // Toggle compare off
    await compareBtn.click();
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'false');

    // Cache verification: unequip top -> re-equip same top -> hits local cache
    await studioCanvas.locator('[data-studio-slot="top"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toHaveCount(0);

    // Re-apply weather recommendation #1 (restores previous combo -> cache hit!)
    const firstRecPill = page
      .locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId} [data-weather-rec-id]`)
      .first();
    await firstRecPill.click();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-cached'), { timeout: 10000 })
      .toBe('true');
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
    await expect(studioCanvas.locator('canvas')).toHaveCount(0);
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
