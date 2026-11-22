import { test, expect } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

test.describe('Login 3D PBR Silk Backdrop, Responsive Glass UX & Portal Transition', () => {
  test('1. 3D PBR silk WebGL canvas renders across Light/Dark x Luxury/Aurora with radial toggle & tactile drag ripple', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/?auth=1');

    const motionStage = page.locator(`#${CARBON_DOM_CONTRACT.loginMotionStageId}`);
    await expect(motionStage).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);

    // WebGL PBR silk canvas must initialize without falling back to 2D CSS gradient
    const silkCanvas = motionStage.locator('canvas.atelier-silk-canvas');
    await expect(silkCanvas).toBeVisible();
    await expect(motionStage).not.toHaveClass(/is-webgl-fallback/);
    const canvasBox = await silkCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThanOrEqual(300);
    expect(canvasBox!.height).toBeGreaterThanOrEqual(500);

    // Default state: Light x Luxury
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'light');
    await expect(motionStage).toHaveAttribute('data-motion-variant', 'luxury');
    const variantToggle = page.locator('button.atelier-silk-toggle-btn');
    await expect(variantToggle).toBeVisible();
    await expect(variantToggle).toHaveAttribute('data-motion-option', 'luxury');
    await expect(variantToggle).toContainText(/럭셔리|Luxury/i);

    // Single toggle switches Luxury -> Aurora with radial transition wave
    await variantToggle.click();
    await expect(motionStage).toHaveAttribute('data-motion-variant', 'aurora');
    await expect(variantToggle).toHaveAttribute('data-motion-option', 'aurora');
    await expect(variantToggle).toContainText(/오로라|Aurora/i);

    // Theme toggle switches Light -> Dark (True OLED #000000 backdrop) synchronously
    const themeToggle = page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`);
    await themeToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'dark');

    // Toggle Aurora -> Luxury in Dark mode
    await variantToggle.click();
    await expect(motionStage).toHaveAttribute('data-motion-variant', 'luxury');
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'dark');

    // Tactile drag across open silk surface runs smoothly with zero runtime errors and zero text selection
    const startX = Math.round(canvasBox!.x + canvasBox!.width * 0.25);
    const startY = Math.round(canvasBox!.y + canvasBox!.height * 0.48);
    const endX = Math.round(canvasBox!.x + canvasBox!.width * 0.78);
    const endY = Math.round(canvasBox!.y + canvasBox!.height * 0.54);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(160);
    const selectedText = await page.evaluate(() => window.getSelection()?.toString().trim() || '');
    expect(selectedText).toBe('');

    // Switch back to Light mode cleanly
    await themeToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'light');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('2. Default 50% glass alpha, screen-wide scroll opacity (10%~96%), pinned iNVTRY logo, and clean Sign-Up stepper', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/?auth=1');
    await page.locator(`#${CARBON_DOM_CONTRACT.introGetStartedBtnId}`).click();
    await expect(page.locator('#login-username')).toBeVisible();

    const readUiAlpha = () =>
      page.evaluate(() => {
        const root = document.querySelector('.atelier-auth-root') as HTMLElement | null;
        if (!root) return Number.NaN;
        const inlineVal = root.style.getPropertyValue('--atelier-ui-alpha').trim();
        const computedVal = window
          .getComputedStyle(root)
          .getPropertyValue('--atelier-ui-alpha')
          .trim();
        return Number.parseFloat(inlineVal || computedVal || '0.5');
      });

    // Default glass UI opacity is 50% (0.500)
    expect(await readUiAlpha()).toBeCloseTo(0.5, 2);

    // Wheel down increases glass opacity up to 96% ceiling (0.960)
    const vp = page.viewportSize()!;
    await page.mouse.move(Math.round(vp.width * 0.12), Math.round(vp.height * 0.5));
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.wheel(0, 360);
    }
    await expect.poll(readUiAlpha).toBeCloseTo(0.96, 2);

    // Wheel up decreases glass opacity down to 10% floor (0.100) to reveal silk backdrop
    for (let i = 0; i < 7; i += 1) {
      await page.mouse.wheel(0, -360);
    }
    await expect.poll(readUiAlpha).toBeCloseTo(0.1, 2);

    // Pinned iNVTRY logo sits cleanly below top controls bar with zero overlap
    const topBar = page.locator('header.atelier-topbar');
    const pinnedLogo = page.locator('.atelier-hero img, .atelier-hero .brand-logo-img').first();
    await expect(pinnedLogo).toBeVisible();
    const [topBarBox, logoBoxBefore] = await Promise.all([
      topBar.boundingBox(),
      pinnedLogo.boundingBox(),
    ]);
    expect(topBarBox).not.toBeNull();
    expect(logoBoxBefore).not.toBeNull();
    expect(logoBoxBefore!.y).toBeGreaterThanOrEqual(topBarBox!.y + topBarBox!.height - 4);

    // Switch to Sign-Up tab -> verify 3-step stepper has list-style: none and non-overlapping columns
    await page.locator('.atelier-segmented [role="tab"]').nth(1).click();
    const stepper = page.locator('.atelier-signup-stepper');
    await expect(stepper).toBeVisible();
    const stepperMetrics = await stepper.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const steps = Array.from(el.querySelectorAll('li')).map((li) => li.getBoundingClientRect());
      let overlaps = false;
      for (let i = 0; i < steps.length; i += 1) {
        for (let j = i + 1; j < steps.length; j += 1) {
          const a = steps[i];
          const b = steps[j];
          if (!(a.right <= b.left + 1 || a.left >= b.right - 1)) {
            overlaps = true;
          }
        }
      }
      return {
        listStyleType: cs.listStyleType,
        stepCount: steps.length,
        overlaps,
      };
    });
    expect(stepperMetrics.listStyleType).toBe('none');
    expect(stepperMetrics.stepCount).toBe(3);
    expect(stepperMetrics.overlaps).toBe(false);

    // Pinned logo stays fixed when scrolling inside the Sign-Up form
    await page.evaluate(() => {
      const scroller = document.querySelector('.atelier-monolith') || document.querySelector('.atelier-auth-reveal');
      if (scroller) scroller.scrollTop = 140;
    });
    const logoBoxAfter = await pinnedLogo.boundingBox();
    expect(logoBoxAfter).not.toBeNull();
    expect(Math.abs(logoBoxAfter!.y - logoBoxBefore!.y)).toBeLessThanOrEqual(2);

    expect(pageErrors).toEqual([]);
  });

  test('3. Login triggers concentric silk-wave portal transition and settles cleanly on Outfits studio', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/?auth=1');
    await page.locator(`#${CARBON_DOM_CONTRACT.introGetStartedBtnId}`).click();
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin');

    // Observe portal DOM phase transitions synchronously in-page (immune to SwiftShader polling stalls)
    await page.evaluate(() => {
      const trace: string[] = [];
      (window as unknown as { __portalTrace?: string[] }).__portalTrace = trace;
      const sample = () => {
        if (
          document.querySelector('.atelier-login-portal-overlay.is-phase-flying') &&
          !trace.includes('flying')
        ) {
          trace.push('flying');
        }
        if (
          document.querySelector('.atelier-login-particle-wave') &&
          !trace.includes('particle-wave')
        ) {
          trace.push('particle-wave');
        }
        if (
          document.querySelector('.hig-native-shell.is-login-portal-revealing') &&
          !trace.includes('revealing')
        ) {
          trace.push('revealing');
        }
      };
      const obs = new MutationObserver(sample);
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      sample();
    });

    await page.locator('#login-submit-btn').click();

    // After portal sequence completes, portal overlay unmounts cleanly and Outfits studio is active at scrollY=0
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`)).toBeVisible({
      timeout: 14000,
    });
    await expect(page.locator('.atelier-login-portal-overlay')).toHaveCount(0, { timeout: 14000 });
    await expect(page.locator('.atelier-login-particle-wave')).toHaveCount(0, { timeout: 5000 });

    const portalTrace = await page.evaluate(
      () => (window as unknown as { __portalTrace?: string[] }).__portalTrace || []
    );
    expect(portalTrace).toEqual(expect.arrayContaining(['flying', 'particle-wave', 'revealing']));
    await expect(page.locator('[data-header-brand-btn="true"]').first()).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
