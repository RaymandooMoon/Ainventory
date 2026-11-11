import { expect, test } from '@playwright/test';

/**
 * Unattended Mobile E2E Verification Suite (Requirement 15.a + Apple HIG 11–12)
 * Runs across both `ios-notch` (393x852) and `android-foldable` (717x841) viewports.
 */
test.describe('Mobile Store-Ready E2E & Apple HIG Compliance', () => {
  test('1. Unauthenticated Sample Demo entry, monochrome Light/Dark HIG tokens, >=85% 3D viewport & borderless cutout wardrobe', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Light & Dark pure monochrome canvas surfaces (#FFFFFF / #000000)
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).toBe('rgb(255, 255, 255)');

    await page.locator('#login-theme-toggle-btn').click();
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(0, 0, 0)');
    await page.locator('#login-theme-toggle-btn').click();

    // 2. Enter Sample Closet Demo Mode via explicit aria-label (Robo crawler & first-time user path)
    const demoBtn = page.getByRole('button', { name: '샘플 옷장 체험 모드 시작' });
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // 3. Verify 3D Studio screen leaves >= 85% viewport clear for mannequin & has 1 top weather capsule
    const studioScreen = page.locator('.hig-studio-screen');
    const studioCanvas = page.locator('#studio-3d-canvas');
    const weatherCapsule = page.locator('#studio-weather-capsule');
    await expect(studioCanvas).toBeVisible();
    await expect(weatherCapsule).toBeVisible();

    const viewportMetrics = await page.evaluate(() => {
      const screenRect = document.querySelector('.hig-studio-screen').getBoundingClientRect();
      const canvasRect = document.querySelector('#studio-3d-canvas').getBoundingClientRect();
      const drawerHandleRect = document
        .querySelector('#studio-drawer-handle')
        .getBoundingClientRect();
      const unobstructedHeight = drawerHandleRect.top - screenRect.top;
      return {
        canvasFullRatio:
          (canvasRect.width * canvasRect.height) / (screenRect.width * screenRect.height),
        unobstructedRatio: (canvasRect.width * unobstructedHeight) / (screenRect.width * screenRect.height),
      };
    });
    expect(viewportMetrics.canvasFullRatio).toBeGreaterThanOrEqual(0.95);
    expect(viewportMetrics.unobstructedRatio).toBeGreaterThanOrEqual(0.85);

    // 4. Switch to Wardrobe Grid & verify borderless cutout-only tiles + Tap / Quick-Menu disclosure
    await page.locator('#mobile-tab-wardrobe').click();
    const firstTile = page.locator('.hig-cutout-tile').first();
    await expect(firstTile).toBeVisible();

    const tileStyle = await firstTile.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
        innerTextLength: (el.innerText || '').trim().length,
      };
    });
    expect(tileStyle.borderTopWidth).toBe('0px');
    expect(tileStyle.boxShadow).toBe('none');
    expect(tileStyle.innerTextLength).toBe(0);

    // Tap -> Detail Bottom Sheet
    await firstTile.click();
    await expect(page.locator('#garment-detail-sheet')).toBeVisible();
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.ui-sheet-backdrop').first().click({ position: { x: 8, y: 8 } });
    await expect(page.locator('#garment-detail-sheet')).toBeHidden();

    // ContextMenu / Long-press -> Quick Action Menu Sheet
    await firstTile.dispatchEvent('contextmenu');
    await expect(page.locator('#garment-quick-menu-sheet')).toBeVisible();
  });

  test('2. Full Lifecycle: Email OTP Sign-up -> Empty Closet -> Upload -> Auto WebP Cutout & AI Slot Mapping -> Offline IndexedDB Sync -> Immediate Permanent Account Deletion', async ({
    page,
    context,
    request,
  }) => {
    await page.goto('/');

    // 1. Register a fresh user via Email OTP
    const uniqueEmail = `e2e_${Date.now()}_${Math.floor(Math.random() * 9999)}@ainventory.test`;
    await page.locator('#auth-tab-register').click();
    await page.locator('#register-email-input').fill(uniqueEmail);
    await page.locator('#send-otp-btn').click();

    // Resend button enters 60s cooldown
    await expect(page.locator('#send-otp-btn')).toBeDisabled();

    // OTP code auto-filled in local dev preview; verify OTP & complete registration
    await expect(page.locator('#verify-otp-btn')).toBeVisible();
    await page.locator('#verify-otp-btn').click();
    await page.locator('#register-name-input').fill('테스트유저');
    await page.locator('#register-password-input').fill('pass1234');
    await page.locator('#complete-register-btn').click();

    // 2. Newly registered user lands in Empty Closet Onboarding (not pre-seeded)
    await expect(page.locator('#studio-empty-closet-card')).toBeVisible();

    // 3. Navigate to Wardrobe -> Open Add Modal -> Verify Pre-Permission Rationale Modal
    await page.locator('#mobile-tab-wardrobe').click();
    await page.locator('#open-add-garment-btn').click();
    await page.locator('#trigger-gallery-upload-btn').click();
    await expect(page.locator('#confirm-camera-permission-btn')).toBeVisible();
    await page.locator('#confirm-camera-permission-btn').click();

    // 4. Generate a synthetic garment image (dark navy coat on clean bright studio background) & feed into file input
    const base64Png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 480;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#F7F7F7';
      ctx.fillRect(0, 0, 360, 480);
      // Draw coat silhouette in center
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(105, 80, 150, 310);
      ctx.fillRect(72, 95, 36, 210);
      ctx.fillRect(252, 95, 36, 210);
      return c.toDataURL('image/png').split(',')[1];
    });

    await page.locator('#wardrobe-gallery-file-input').setInputFiles({
      name: 'navy-coat-upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64Png, 'base64'),
    });

    // 5. SmartPhotoCropEditorModal opens -> confirm crop -> verify WebP Cutout + AI 3D Slot Mapping
    await expect(page.locator('#confirm-smart-crop-btn')).toBeVisible();
    await page.locator('#confirm-smart-crop-btn').click();

    const previewImg = page.locator('#cropped-webp-preview-img');
    await expect(previewImg).toBeVisible();
    const previewSrc = await previewImg.getAttribute('src');
    expect(previewSrc?.startsWith('data:image/webp')).toBeTruthy();

    const mappingSummary = page.locator('#ai-garment-mapping-summary');
    await expect(mappingSummary).toBeVisible();
    await expect(mappingSummary).toContainText('WEBP');

    // Save garment to closet
    await page.locator('#submit-add-garment-btn').click();
    await expect(page.locator('.hig-cutout-tile')).toHaveCount(1);

    // 6. Offline-First IndexedDB Cache & Optimistic Queue Sync Verification
    await page.locator('#mobile-tab-analytics').click();
    await expect(page.locator('#bento-cpw-card')).toBeVisible();

    await context.setOffline(true);
    // Reloading wardrobe & creating a trip packing list while completely offline
    await page.locator('#bento-packing-card').click();
    await page.locator('#packing-title-input').fill('오프라인 제주 출장');
    await page.locator('#packing-dest-input').fill('제주');
    await page.locator('#create-packing-list-btn').click();
    await expect(page.getByText('오프라인 제주 출장 · 제주')).toBeVisible();

    // Restore online connectivity so queue flushes cleanly
    await context.setOffline(false);
    await page.locator('.ui-sheet-backdrop').first().click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(350);

    // 7. Immediate Permanent Account & Personal Data Deletion
    await page.locator('#mobile-open-account-settings-btn').click();
    await page.locator('#initiate-delete-account-btn').click();
    await page.locator('#delete-account-permanent-btn').click();

    // Immediately redirected back to initial unauthenticated screen
    await expect(page.getByRole('button', { name: '샘플 옷장 체험 모드 시작' })).toBeVisible();

    // Deleted credentials must return 401 from backend
    const loginCheck = await request.post('/api/auth/login', {
      data: { username: uniqueEmail, password: 'pass1234' },
    });
    expect(loginCheck.status()).toBe(401);
  });
});
