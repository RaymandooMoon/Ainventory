import { expect, test } from '@playwright/test';

/**
 * 3D Studio Touch Isolation, Vibrancy Blur Cap & Fallback, WebGL Context Recovery,
 * Zero Memory Leak & >= 50 FPS Quantitative Telemetry Suite (Requirement 15b)
 */

async function readDrawerExpanded(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('#studio-wardrobe-drawer');
    const handle = document.querySelector('#studio-drawer-handle');
    if (drawer?.hasAttribute('aria-expanded')) {
      return drawer.getAttribute('aria-expanded');
    }
    if (handle?.hasAttribute('aria-expanded')) {
      return handle.getAttribute('aria-expanded');
    }
    return drawer?.getAttribute('data-drawer-state') === 'expanded' ? 'true' : 'false';
  });
}

async function countVisibleBlurLayers(page) {
  return page.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      const bf = `${style.backdropFilter || ''} ${style.webkitBackdropFilter || ''}`.toLowerCase();
      if (bf.includes('blur(')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          count += 1;
        }
      }
    }
    return count;
  });
}

test.describe('3D Studio Touch Isolation, WebGL Context Recovery & Memory/FPS Telemetry (Req 15b)', () => {
  test('Quantitative verification: 0-deg touch interference, <=1 vibrancy blur & low-FPS fallback, WEBGL_lose_context recovery, 12-swap zero leak & >=50 FPS', async ({
    page,
  }) => {
    await page.goto('/');

    const sampleBtn = page.locator('#enter-sample-demo-btn');
    await expect(sampleBtn).toBeVisible();
    await sampleBtn.click();

    const canvas = page.locator('#studio-3d-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-3d-active', 'true');

    // Wait for Three.js WebGL engine & initial garments to finish loading
    await page.waitForFunction(
      () => {
        const eng =
          window.__MANNEQUIN_3D_ENGINE__ ||
          window.__ainventory3DEngine ||
          document.querySelector('#studio-3d-canvas')?.__mannequinEngine;
        if (eng && !window.__MANNEQUIN_3D_ENGINE__) {
          window.__MANNEQUIN_3D_ENGINE__ = eng;
        }
        const t = eng?.getTelemetry?.();
        return Boolean(t && t.frameCount > 12 && (t.activeGarmentIds || []).length > 0);
      },
      null,
      { timeout: 20000 }
    );

    // -------------------------------------------------------------------------
    // 1. Touch Interference Absence (Canvas Horizontal Drag vs Drawer Vertical Swipe)
    // -------------------------------------------------------------------------
    expect(await readDrawerExpanded(page)).toBe('false');

    const yawBeforeCanvasDrag = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().currentYawDeg
    );

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const cx = canvasBox.x + canvasBox.width * 0.5;
    const cy = canvasBox.y + canvasBox.height * 0.42;

    await page.mouse.move(cx - 40, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 85, cy, { steps: 10 });
    await page.mouse.up();

    // Wait for smooth yaw damping to settle onto targetYawDeg
    await page.waitForFunction(
      () => {
        const t = window.__MANNEQUIN_3D_ENGINE__.getTelemetry();
        return Math.abs(t.targetYawDeg - t.currentYawDeg) < 0.05;
      },
      null,
      { timeout: 5000 }
    );

    const yawAfterCanvasDrag = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().currentYawDeg
    );
    const deltaYaw = yawAfterCanvasDrag - yawBeforeCanvasDrag;
    expect(Math.abs(deltaYaw)).toBeGreaterThan(8);
    expect(await readDrawerExpanded(page)).toBe('false');

    // Vertical swipe UP on #studio-drawer-handle -> opens drawer, 0-deg yaw leak (< 0.5 deg)
    const beforeDrawerSwipeYaw = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().currentYawDeg
    );

    const closedHandleBox = await page.locator('#studio-drawer-handle').boundingBox();
    expect(closedHandleBox).not.toBeNull();
    const hx = closedHandleBox.x + closedHandleBox.width / 2;
    const hy = closedHandleBox.y + closedHandleBox.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy - 150, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => readDrawerExpanded(page)).toBe('true');
    const afterOpenYaw = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().currentYawDeg
    );
    expect(Math.abs(afterOpenYaw - beforeDrawerSwipeYaw)).toBeLessThan(0.5);

    // Vertical swipe DOWN on #studio-drawer-handle -> closes drawer, 0-deg yaw leak (< 0.5 deg)
    const openHandleBox = await page.locator('#studio-drawer-handle').boundingBox();
    expect(openHandleBox).not.toBeNull();
    const ohx = openHandleBox.x + openHandleBox.width / 2;
    const ohy = openHandleBox.y + openHandleBox.height / 2;

    await page.mouse.move(ohx, ohy);
    await page.mouse.down();
    await page.mouse.move(ohx, ohy + 170, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => readDrawerExpanded(page)).toBe('false');
    const afterCloseYaw = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().currentYawDeg
    );
    expect(Math.abs(afterCloseYaw - beforeDrawerSwipeYaw)).toBeLessThan(0.5);

    // -------------------------------------------------------------------------
    // 2. Vibrancy Blur Cap (<= 1 layer) & Low-FPS Solid Fallback
    // -------------------------------------------------------------------------
    await expect(page.locator('html')).toHaveAttribute('data-3d-active', 'true');
    const initialBlurLayerCount = await countVisibleBlurLayers(page);
    expect(initialBlurLayerCount).toBeLessThanOrEqual(1);

    const hasSimulatedLowFpsFn = await page.evaluate(
      () => typeof window.__MANNEQUIN_3D_ENGINE__?.setSimulatedLowFps === 'function'
    );

    if (hasSimulatedLowFpsFn) {
      const degradedState = await page.evaluate(() => {
        const eng = window.__MANNEQUIN_3D_ENGINE__;
        eng.setSimulatedLowFps(true);
        return {
          fallbackAttr: document.documentElement.getAttribute('data-vibrancy-fallback'),
          vibrancyDegraded: eng.getTelemetry().vibrancyDegraded,
        };
      });
      expect(degradedState.fallbackAttr).toBe('solid');
      expect(degradedState.vibrancyDegraded).toBe(true);
      expect(await countVisibleBlurLayers(page)).toBe(0);

      const restoredState = await page.evaluate(() => {
        const eng = window.__MANNEQUIN_3D_ENGINE__;
        eng.setSimulatedLowFps(false);
        return {
          fallbackAttr: document.documentElement.getAttribute('data-vibrancy-fallback'),
          vibrancyDegraded: eng.getTelemetry().vibrancyDegraded,
        };
      });
      expect(restoredState.fallbackAttr).not.toBe('solid');
      expect(restoredState.vibrancyDegraded).toBe(false);
      expect(await countVisibleBlurLayers(page)).toBeLessThanOrEqual(1);
    } else {
      // Fallback verification via engine's rolling frame-time degradation loop (< 45 FPS -> solid)
      await page.evaluate(() => {
        const eng = window.__MANNEQUIN_3D_ENGINE__;
        eng._frameMsSamples = Array(32).fill(36);
      });
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-vibrancy-fallback') === 'solid',
        null,
        { timeout: 3000 }
      );
      expect(await countVisibleBlurLayers(page)).toBe(0);

      await page.evaluate(() => {
        const eng = window.__MANNEQUIN_3D_ENGINE__;
        eng._frameMsSamples = Array(32).fill(15);
      });
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-vibrancy-fallback') !== 'solid',
        null,
        { timeout: 3000 }
      );
      expect(await countVisibleBlurLayers(page)).toBeLessThanOrEqual(1);
    }

    // -------------------------------------------------------------------------
    // 3. Forced `WEBGL_lose_context` Auto-Recovery
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const eng = window.__MANNEQUIN_3D_ENGINE__;
      if (typeof eng.simulateContextLoss === 'function') {
        eng.simulateContextLoss({ autoRestoreMs: 280 });
        return;
      }
      const ext =
        eng._loseContextExt || eng.renderer.getContext().getExtension('WEBGL_lose_context');
      eng._loseContextExt = ext;
      ext.loseContext();
    });

    await page.waitForFunction(
      () => {
        const t = window.__MANNEQUIN_3D_ENGINE__?.getTelemetry?.();
        return Boolean(t && t.isContextLost === false && t.recoveryCount >= 1);
      },
      null,
      { timeout: 8000 }
    );

    const postRestoreTelemetry = await page.evaluate(() =>
      window.__MANNEQUIN_3D_ENGINE__.getTelemetry()
    );
    expect(postRestoreTelemetry.isContextLost).toBe(false);
    expect(postRestoreTelemetry.recoveryCount).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => window.__MANNEQUIN_3D_ENGINE__.markDirty?.());
    await page.waitForTimeout(300);

    const advancingTelemetry = await page.evaluate(() =>
      window.__MANNEQUIN_3D_ENGINE__.getTelemetry()
    );
    expect(advancingTelemetry.frameCount).toBeGreaterThan(postRestoreTelemetry.frameCount);

    // -------------------------------------------------------------------------
    // 4. Three.js Memory Leak Absence across 12 Garment Swaps & >= 50 Steady FPS
    // -------------------------------------------------------------------------
    await page.locator('#studio-drawer-handle').click();
    await expect.poll(() => readDrawerExpanded(page)).toBe('true');

    const swapCategories = ['outer', 'top', 'bottom', 'shoes', 'accessory', 'neckwear'];

    // Warm up category template cache once so baseline captures active multi-slot steady state
    for (const slot of swapCategories) {
      const chip = page.locator(`#drawer-slot-chip-${slot}`);
      if (!(await chip.isVisible().catch(() => false))) continue;
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      const tiles = page.locator('.drawer-garment-tile');
      if ((await tiles.count()) > 0) {
        await tiles.first().click();
      }
    }
    await page.waitForTimeout(400);

    const baseline = await page.evaluate(() => window.__MANNEQUIN_3D_ENGINE__.getTelemetry());

    // Execute >= 12 consecutive garment equip / unequip swaps across categories in the drawer
    let swapOps = 0;
    for (let pass = 0; pass < 3 && swapOps < 12; pass += 1) {
      for (const slot of swapCategories) {
        if (swapOps >= 12) break;
        const chip = page.locator(`#drawer-slot-chip-${slot}`);
        if (!(await chip.isVisible().catch(() => false))) continue;
        await chip.scrollIntoViewIfNeeded();
        await chip.click();

        const tiles = page.locator('.drawer-garment-tile');
        const count = await tiles.count();
        if (count === 0) continue;

        if (count > 1) {
          await tiles.nth(1).click();
          swapOps += 1;
        }

        const unequipBtn = page.locator('#drawer-unequip-slot-btn');
        if (await unequipBtn.isVisible().catch(() => false)) {
          await unequipBtn.click();
          swapOps += 1;
        }

        // Re-equip first item so final slot loadout matches baseline steady state
        await tiles.nth(0).click();
        swapOps += 1;
      }
    }
    expect(swapOps).toBeGreaterThanOrEqual(12);

    // Allow final async garment GLB/material disposal pass & camera settle to complete
    await page.locator('#studio-drawer-handle').click();
    await expect.poll(() => readDrawerExpanded(page)).toBe('false');
    await page.waitForTimeout(450);

    // Reset FPS sampling window and measure steady-state FPS
    await page.evaluate(() => {
      const eng = window.__MANNEQUIN_3D_ENGINE__;
      if (typeof eng.resetFpsWindow === 'function') {
        eng.resetFpsWindow();
      }
      eng._fpsSamples = [];
      eng.lastRawNowMs = performance.now();
    });
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => window.__MANNEQUIN_3D_ENGINE__.getTelemetry());

    expect(after.geometries).toBeLessThanOrEqual(baseline.geometries + 2);
    expect(after.textures).toBeLessThanOrEqual(baseline.textures + 2);
    expect(after.avgFps).toBeGreaterThanOrEqual(50);
  });
});
