import { expect, test } from '@playwright/test';

/**
 * 3D WebGL Studio Touch Isolation, Context Loss Recovery & 60FPS / Zero-Leak Telemetry Suite (Reqs 14.b & 15.b)
 */
test.describe('3D Studio Touch Isolation, WebGL Context Recovery & Memory/FPS Guardrails', () => {
  test('Verifies 0-deg touch interference, <=1 vibrancy blur layer, automatic WEBGL_lose_context recovery, zero memory leak & >=50 FPS', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '샘플 옷장 체험 모드 시작' }).click();

    const canvas = page.locator('#studio-3d-canvas');
    await expect(canvas).toBeVisible();

    // Wait for Three.js WebGL engine to render initial frames
    await page.waitForFunction(
      () =>
        Boolean(window.__ainventory3DEngine) &&
        window.__ainventory3DEngine.getTelemetry().frameCount > 10,
      null,
      { timeout: 15000 }
    );

    // 1. Requirement 14.b: At most 1 concurrent live backdrop-filter blur layer while 3D WebGL is active
    const activeBlurLayers = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          continue;
        }
        const bf = style.backdropFilter || style.webkitBackdropFilter || 'none';
        if (bf && bf !== 'none') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) count += 1;
        }
      }
      return count;
    });
    expect(activeBlurLayers).toBeLessThanOrEqual(1);

    // 2. Requirement 15.b (1): Zero Touch Interference between Bottom Drawer Swipe & 3D Rotation
    const yawInitial = await page.evaluate(
      () => window.__ainventory3DEngine.getTelemetry().targetYawDeg
    );

    const handleBox = await page.locator('#studio-drawer-handle').boundingBox();
    expect(handleBox).not.toBeNull();
    const hx = handleBox.x + handleBox.width / 2;
    const hy = handleBox.y + handleBox.height / 2;

    // Swipe UP on wardrobe drawer handle -> expands drawer, 3D yaw MUST NOT change (0.00 deg delta)
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy - 140, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('#studio-wardrobe-drawer')).toHaveAttribute(
      'data-drawer-state',
      'expanded'
    );
    const yawAfterDrawerOpen = await page.evaluate(
      () => window.__ainventory3DEngine.getTelemetry().targetYawDeg
    );
    expect(Math.abs(yawAfterDrawerOpen - yawInitial)).toBe(0);

    // Swipe DOWN on wardrobe drawer handle -> collapses drawer, 3D yaw MUST NOT change
    const openHandleBox = await page.locator('#studio-drawer-handle').boundingBox();
    const ohx = openHandleBox.x + openHandleBox.width / 2;
    const ohy = openHandleBox.y + openHandleBox.height / 2;
    await page.mouse.move(ohx, ohy);
    await page.mouse.down();
    await page.mouse.move(ohx, ohy + 160, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('#studio-wardrobe-drawer')).toHaveAttribute(
      'data-drawer-state',
      'collapsed'
    );
    const yawAfterDrawerClose = await page.evaluate(
      () => window.__ainventory3DEngine.getTelemetry().targetYawDeg
    );
    expect(Math.abs(yawAfterDrawerClose - yawInitial)).toBe(0);

    // Drag horizontally on 3D Canvas -> rotates mannequin yaw while drawer remains collapsed
    const canvasBox = await canvas.boundingBox();
    const cx = canvasBox.x + canvasBox.width * 0.5;
    const cy = canvasBox.y + canvasBox.height * 0.42;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy, { steps: 6 });
    await page.mouse.up();

    const yawAfterCanvasDrag = await page.evaluate(
      () => window.__ainventory3DEngine.getTelemetry().targetYawDeg
    );
    expect(Math.abs(yawAfterCanvasDrag - yawInitial)).toBeGreaterThan(15);
    await expect(page.locator('#studio-wardrobe-drawer')).toHaveAttribute(
      'data-drawer-state',
      'collapsed'
    );

    // 3. Requirement 15.b (2): Forced `WEBGL_lose_context` -> Automatic Restoration Verification
    await page.evaluate(() => {
      const eng = window.__ainventory3DEngine;
      const ext =
        eng._loseContextExt || eng.renderer.getContext().getExtension('WEBGL_lose_context');
      eng._loseContextExt = ext;
      ext.loseContext();
    });

    await page.waitForFunction(
      () => {
        const t = window.__ainventory3DEngine?.getTelemetry();
        return Boolean(t && t.isContextLost === false && t.recoveryCount >= 1);
      },
      null,
      { timeout: 6000 }
    );

    const postRecoveryTelemetry = await page.evaluate(() =>
      window.__ainventory3DEngine.getTelemetry()
    );
    expect(postRecoveryTelemetry.isContextLost).toBe(false);
    expect(postRecoveryTelemetry.recoveryCount).toBeGreaterThanOrEqual(1);

    // 4. Requirement 15.b (3): Repeated Garment Swaps -> Zero Geometry/Texture Memory Leak & Avg >= 50 FPS
    await page.locator('#studio-drawer-handle').click();
    await expect(page.locator('#studio-wardrobe-drawer')).toHaveAttribute(
      'data-drawer-state',
      'expanded'
    );

    // Warm-up slot caches once
    await page.locator('#drawer-slot-chip-outer').click();
    const outerTiles = page.locator('.drawer-garment-tile');
    if ((await outerTiles.count()) > 1) {
      await outerTiles.nth(1).click();
      await outerTiles.nth(0).click();
    }

    const baselineMem = await page.evaluate(() => window.__ainventory3DEngine.getTelemetry());

    // Execute 10 consecutive garment swaps / unequips across slots
    for (let i = 0; i < 5; i++) {
      const tileCount = await outerTiles.count();
      if (tileCount > 1) {
        await outerTiles.nth((i + 1) % tileCount).click();
      }
      const unequipBtn = page.locator('#drawer-unequip-slot-btn');
      if (await unequipBtn.isVisible()) {
        await unequipBtn.click();
      }
      if (tileCount > 0) {
        await outerTiles.nth(0).click();
      }
    }

    // Let 60-frame rolling FPS window sample steady rendering after swaps
    await page.evaluate(() => {
      window.__ainventory3DEngine._fpsSamples = [];
      window.__ainventory3DEngine._lastFpsStamp = performance.now();
    });
    await page.waitForTimeout(900);

    const afterSwaps = await page.evaluate(() => window.__ainventory3DEngine.getTelemetry());

    expect(afterSwaps.geometries).toBeLessThanOrEqual(baselineMem.geometries + 2);
    expect(afterSwaps.textures).toBeLessThanOrEqual(baselineMem.textures + 2);
    expect(afterSwaps.avgFps).toBeGreaterThanOrEqual(50);
    expect(afterSwaps.jiggle).not.toBeNull();
    expect(afterSwaps.jiggle.crossbodyBag.rz).toBeGreaterThanOrEqual(-0.008);
    expect(afterSwaps.jiggle.neckTip.rx).toBeLessThanOrEqual(0.028);
  });
});
