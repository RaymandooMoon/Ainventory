import { expect, test } from '@playwright/test';

/**
 * Unattended Mobile E2E Verification Suite (Requirement 15a + Apple HIG 11–14)
 * Executes across both `ios-notch` (393x852, DPR 3) and `android-foldable` (717x841, DPR 2.6) viewports.
 */

async function dismissOpenSheetByDragOrBackdrop(page, targetLocator) {
  const handle = page
    .locator('[data-sheet-handle="true"]:visible, .ui-sheet-drag-zone:visible')
    .last();
  if (await handle.isVisible().catch(() => false)) {
    const box = await handle.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 180, { steps: 12 });
      await page.waitForTimeout(45);
      await page.mouse.up();
    }
  }
  if (targetLocator && (await targetLocator.isVisible().catch(() => false))) {
    const backdrop = page.locator('.ui-sheet-backdrop:visible').last();
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click({ position: { x: 8, y: 8 } });
    }
  }
}

test.describe('Mobile Store-Ready E2E & Apple HIG Progressive Disclosure (Req 15a)', () => {
  test('1. HIG Monochrome & Typography, >=85% 3D Studio, Cutout Grid, Spring Sheets & Bento Insights', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Sample Closet Demo entry button & exact aria-label
    const demoBtn = page.locator('#enter-sample-demo-btn');
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toHaveAttribute('aria-label', '샘플 옷장 체험 모드 시작');

    // 2. Verify Light (#FFFFFF) & Dark (#000000) pure monochrome canvas + system font stack + tabular-nums
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    if (initialTheme === 'dark') {
      await page.locator('#login-theme-toggle-btn').click();
    }

    const lightSurfaceMetrics = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        backgroundColor: cs.backgroundColor,
        fontFamily: cs.fontFamily,
        fontVariantNumeric: cs.fontVariantNumeric,
      };
    });
    expect(lightSurfaceMetrics.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(lightSurfaceMetrics.fontFamily).toContain('-apple-system');
    expect(lightSurfaceMetrics.fontVariantNumeric).toContain('tabular-nums');

    await page.locator('#login-theme-toggle-btn').click();
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(0, 0, 0)');

    // Restore Light mode before entering Sample Demo
    await page.locator('#login-theme-toggle-btn').click();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgb(255, 255, 255)'
    );

    // 3. Enter Sample Demo Mode -> 3D Studio >= 85% viewport height, weather capsule & collapsed drawer
    await demoBtn.click();

    const studioScreen = page.locator('.hig-studio-screen');
    const studioCanvas = page.locator('#studio-3d-canvas');
    const weatherCapsule = page.locator('#studio-weather-capsule');
    const wardrobeDrawer = page.locator('#studio-wardrobe-drawer');

    await expect(studioScreen).toBeVisible();
    await expect(studioCanvas).toBeVisible();
    await expect(weatherCapsule).toBeVisible();
    await expect(wardrobeDrawer).toBeAttached();

    const studioMetrics = await page.evaluate(() => {
      const screenEl = document.querySelector('.hig-studio-screen');
      const canvasEl = document.querySelector('#studio-3d-canvas');
      const handleEl = document.querySelector('#studio-drawer-handle');
      const drawerEl = document.querySelector('#studio-wardrobe-drawer');
      const weatherEl = document.querySelector('#studio-weather-capsule');

      const screenRect = screenEl.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();
      const handleRect = handleEl.getBoundingClientRect();
      const unobstructedHeight = Math.max(0, handleRect.top - screenRect.top);

      const drawerAria =
        drawerEl?.getAttribute('aria-expanded') ??
        handleEl?.getAttribute('aria-expanded') ??
        (drawerEl?.getAttribute('data-drawer-state') === 'expanded' ? 'true' : 'false');

      return {
        studioViewportHeightRatio: screenRect.height / window.innerHeight,
        unobstructedViewportRatio: unobstructedHeight / window.innerHeight,
        canvasCoverageRatio:
          (canvasRect.width * canvasRect.height) / (screenRect.width * screenRect.height),
        drawerAria,
        drawerCollapsedClass:
          drawerEl?.classList.contains('collapsed') ||
          drawerEl?.getAttribute('data-drawer-state') === 'collapsed',
        weatherFontVariantNumeric: getComputedStyle(weatherEl).fontVariantNumeric,
      };
    });

    expect(studioMetrics.studioViewportHeightRatio).toBeGreaterThanOrEqual(0.85);
    expect(studioMetrics.unobstructedViewportRatio).toBeGreaterThanOrEqual(0.85);
    expect(studioMetrics.canvasCoverageRatio).toBeGreaterThanOrEqual(0.95);
    expect(studioMetrics.drawerAria).toBe('false');
    expect(studioMetrics.drawerCollapsedClass).toBe(true);
    expect(studioMetrics.weatherFontVariantNumeric).toContain('tabular-nums');

    // 4. Navigate to Wardrobe -> Borderless cutout-only tiles, Spring Detail Sheet & Drag-to-Dismiss, Quick Menu
    await page.locator('#mobile-tab-wardrobe').click();
    const firstTile = page.locator('.hig-cutout-tile').first();
    await expect(firstTile).toBeVisible();

    const tileMetrics = await firstTile.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderWidth: cs.borderWidth || cs.borderTopWidth,
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
        persistentTextLength: (el.innerText || '').trim().length,
        persistentButtonCount: el.querySelectorAll('button').length,
      };
    });
    expect(tileMetrics.borderWidth).toBe('0px');
    expect(tileMetrics.borderTopWidth).toBe('0px');
    expect(tileMetrics.boxShadow).toBe('none');
    expect(tileMetrics.persistentTextLength).toBe(0);
    expect(tileMetrics.persistentButtonCount).toBe(0);

    // Tap cutout tile -> opens #garment-detail-sheet with spring curve cubic-bezier(0.32, 0.72, 0, 1)
    await firstTile.click();
    const detailSheet = page.locator('#garment-detail-sheet');
    await expect(detailSheet).toBeVisible();

    const detailSpringInfo = await page.evaluate(() => {
      const detailEl = document.querySelector('#garment-detail-sheet');
      const panelEl =
        detailEl?.closest('[data-sheet-panel="true"]') ||
        document.querySelector('[data-sheet-panel="true"]') ||
        detailEl?.closest('.ui-sheet-box');
      if (!panelEl) return null;
      const cs = getComputedStyle(panelEl);
      const springVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--spring-ease')
        .trim();
      return {
        transitionTimingFunction: cs.transitionTimingFunction,
        animationTimingFunction: cs.animationTimingFunction,
        springVar,
      };
    });
    expect(detailSpringInfo).not.toBeNull();
    expect(
      `${detailSpringInfo.transitionTimingFunction} ${detailSpringInfo.animationTimingFunction} ${detailSpringInfo.springVar}`
    ).toContain('cubic-bezier(0.32, 0.72, 0, 1)');

    // Downward drag on [data-sheet-handle="true"] (or sheet drag zone) dismisses #garment-detail-sheet
    await page.waitForTimeout(460); // Let 0.42s spring entrance settle so handle coordinates are stationary
    const sheetHandle = page
      .locator('[data-sheet-handle="true"]:visible, .ui-sheet-drag-zone:visible')
      .last();
    await expect(sheetHandle).toBeVisible();
    const handleBox = await sheetHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    const viewportSize = page.viewportSize() || { width: 393, height: 852 };
    const shx = handleBox.x + handleBox.width / 2;
    const shy = handleBox.y + handleBox.height / 2;
    const dragEndY = Math.min(viewportSize.height - 12, shy + 160);
    await page.mouse.move(shx, shy);
    await page.mouse.down();
    await page.mouse.move(shx, dragEndY, { steps: 14 });
    await page.waitForTimeout(60);
    await page.mouse.up();
    await expect(detailSheet).toBeHidden();

    // Right-click / contextmenu on .hig-cutout-tile opens #garment-quick-menu-sheet
    await firstTile.dispatchEvent('contextmenu');
    const quickMenuSheet = page.locator('#garment-quick-menu-sheet');
    await expect(quickMenuSheet).toBeVisible();
    await dismissOpenSheetByDragOrBackdrop(page, quickMenuSheet);
    await expect(quickMenuSheet).toBeHidden();

    // 5. Navigate to Insights -> Bento summary cards borderless/shadowless + tabular-nums + drill-down sheet
    await page.locator('#mobile-tab-analytics').click();

    const cpwCard = page.locator('#bento-cpw-card');
    const utilizationCard = page.locator('#bento-utilization-card, #bento-dormant-card').first();
    const packingCard = page.locator('#bento-packing-card');

    await expect(cpwCard).toBeVisible();
    await expect(utilizationCard).toBeVisible();
    await expect(packingCard).toBeVisible();

    for (const card of [cpwCard, utilizationCard, packingCard]) {
      const cardStyle = await card.evaluate((el) => {
        const cs = getComputedStyle(el);
        const numEl = el.querySelector('.tabular-nums') || el;
        return {
          borderWidth: cs.borderWidth || cs.borderTopWidth,
          borderTopWidth: cs.borderTopWidth,
          boxShadow: cs.boxShadow,
          fontVariantNumeric: getComputedStyle(numEl).fontVariantNumeric,
        };
      });
      expect(cardStyle.borderWidth).toBe('0px');
      expect(cardStyle.borderTopWidth).toBe('0px');
      expect(cardStyle.boxShadow).toBe('none');
      expect(cardStyle.fontVariantNumeric).toContain('tabular-nums');
    }

    // Tap #bento-cpw-card -> opens drill-down bottom sheet
    await cpwCard.click();
    const drilldownSheetPanel = page
      .locator('[data-sheet-panel="true"]:visible, .ui-sheet-box:visible')
      .first();
    await expect(drilldownSheetPanel).toBeVisible();
    const drilldownEasing = await drilldownSheetPanel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.transitionTimingFunction} ${cs.animationTimingFunction}`;
    });
    expect(drilldownEasing).toContain('cubic-bezier(0.32, 0.72, 0, 1)');
    await dismissOpenSheetByDragOrBackdrop(page, drilldownSheetPanel);
  });

  test('2. Full Authenticated Lifecycle: Email OTP Signup -> Empty Closet -> Synthetic Coat WebP Cutout & 3D Wear -> Offline IndexedDB Cache & Sync -> Immediate Permanent Account Deletion', async ({
    page,
    context,
  }) => {
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Network.enable');
    const setBrowserOnline = async (online) => {
      if (!online) {
        await context.setOffline(true);
        await cdpSession.send('Network.emulateNetworkConditions', {
          offline: true,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        });
      } else {
        await context.setOffline(false);
        await cdpSession.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 0,
          downloadThroughput: 50 * 1024 * 1024,
          uploadThroughput: 50 * 1024 * 1024,
        });
      }
    };
    await setBrowserOnline(true);

    await page.goto('/?login=1');

    // 1. Email OTP Signup
    const uniqueEmail = `e2e_${Date.now()}_${Math.floor(Math.random() * 99999)}@ainventory.test`;

    const directEmailInput = page.locator('#email-auth-input');
    if (!(await directEmailInput.isVisible().catch(() => false))) {
      const registerTab = page.locator('#auth-tab-register');
      if (await registerTab.isVisible().catch(() => false)) {
        await registerTab.click();
      }
    }

    const emailInput = page.locator('#email-auth-input, #register-email-input').first();
    await expect(emailInput).toBeVisible();
    await emailInput.fill(uniqueEmail);

    const requestCodeBtn = page.locator('#request-email-code-btn, #send-otp-btn').first();
    await expect(requestCodeBtn).toBeVisible();

    const [otpDispatchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/auth/') &&
          res.request().method() === 'POST' &&
          res.status() < 500
      ),
      requestCodeBtn.click(),
    ]);
    const otpDispatchJson = await otpDispatchRes.json().catch(() => ({}));
    const previewOtp = String(
      otpDispatchJson.devPreviewCode ||
        otpDispatchJson.verificationCode ||
        otpDispatchJson.verification?.code ||
        otpDispatchJson.code ||
        ''
    );

    const otpInput = page.locator('#email-otp-code-input, #register-otp-input').first();
    await expect(otpInput).toBeVisible();
    const existingOtpVal = await otpInput.inputValue();
    if (!existingOtpVal && previewOtp) {
      await otpInput.fill(previewOtp);
    }

    const verifyCodeBtn = page.locator('#verify-email-code-btn, #verify-otp-btn').first();
    await expect(verifyCodeBtn).toBeVisible();
    await verifyCodeBtn.click();

    // Complete second-step profile/password registration fields if shown by LoginView
    const completeRegBtn = page.locator('#complete-register-btn');
    if (await completeRegBtn.isVisible().catch(() => false)) {
      const nameInput = page.locator('#register-name-input');
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('모바일E2E테스터');
      }
      const pwInput = page.locator('#register-password-input');
      if (await pwInput.isVisible().catch(() => false)) {
        await pwInput.fill('pass1234');
      }
      await expect(completeRegBtn).toBeEnabled();
      await completeRegBtn.click();
    }

    // Verify authenticated session & empty closet (0 garments)
    await expect(page.locator('#studio-3d-canvas')).toBeVisible();
    await expect(page.locator('#studio-empty-closet-card')).toBeVisible();

    const { authToken, userCloset } = await page.evaluate(async () => {
      const token = localStorage.getItem('ainventory_auth_token') || '';
      const meRes = await fetch('/api/auth/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const meJson = await meRes.json().catch(() => ({}));
      return {
        authToken: token,
        userCloset: meJson.user?.defaultCloset || '',
      };
    });
    expect(authToken.length).toBeGreaterThan(10);
    expect(userCloset).toBeTruthy();

    await page.locator('#mobile-tab-wardrobe').click();
    await expect(page.getByText(/비어 있습니다|빈 옷장/).first()).toBeVisible();
    await expect(page.locator('.hig-cutout-tile')).toHaveCount(0);

    // 2. Upload synthetic dark-navy long coat on bright background -> auto WebP cutout & AI outer/coat mapping
    const openAddBtn = page.locator('#open-garment-add-btn, #open-add-garment-btn').first();
    await expect(openAddBtn).toBeVisible();
    await openAddBtn.click();

    const syntheticCoatBase64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 520;
      const ctx = c.getContext('2d');
      // Clean bright studio background (#F8F8FA)
      ctx.fillStyle = '#F8F8FA';
      ctx.fillRect(0, 0, c.width, c.height);
      // High-aspect solid dark navy long coat silhouette (realAspect > 2.0, zero lower split gap)
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(118, 56, 124, 384);
      ctx.fillRect(92, 74, 28, 224);
      ctx.fillRect(240, 74, 28, 224);
      return c.toDataURL('image/png').split(',')[1];
    });

    const photoInput = page
      .locator('#garment-photo-file-input, #wardrobe-gallery-file-input')
      .first();
    await photoInput.setInputFiles({
      name: 'synthetic-navy-coat.png',
      mimeType: 'image/png',
      buffer: Buffer.from(syntheticCoatBase64, 'base64'),
    });

    // Confirm SmartPhotoCropEditorModal if opened
    const confirmCropBtn = page.locator('#confirm-smart-crop-btn');
    try {
      await confirmCropBtn.waitFor({ state: 'visible', timeout: 3000 });
      await confirmCropBtn.click();
    } catch {
      // Direct WebP pipeline without intermediate crop step
    }

    // Verify automatic background removal produces image/webp
    const webpPreview = page
      .locator('#cropped-webp-preview-img, img[src^="data:image/webp"], img[src$=".webp"]')
      .first();
    await expect(webpPreview).toBeVisible();
    const previewSrc = (await webpPreview.getAttribute('src')) || '';
    expect(
      previewSrc.startsWith('data:image/webp') || previewSrc.toLowerCase().endsWith('.webp')
    ).toBe(true);

    // Verify AI slot mapping auto-classifies coat / outer
    const mappingBadge = page.locator('#ai-garment-mapping-summary');
    if (await mappingBadge.isVisible().catch(() => false)) {
      const badgeText = (await mappingBadge.textContent()) || '';
      expect(badgeText.toUpperCase()).toContain('WEBP');
      expect(badgeText.toLowerCase()).toMatch(/outer|coat/);
    }
    const categorySelect = page.locator('select[aria-label="대분류 카테고리"]');
    if (await categorySelect.isVisible().catch(() => false)) {
      await expect(categorySelect).toHaveValue('outer');
    }

    const nameInput = page.locator('#garment-name-input');
    if (await nameInput.isVisible().catch(() => false)) {
      const currentName = await nameInput.inputValue();
      if (!currentName.trim()) {
        await nameInput.fill('네이비 캐시미어 롱 코트');
      }
    }

    const saveGarmentBtn = page
      .locator('#save-garment-submit-btn, #submit-add-garment-btn')
      .first();
    await expect(saveGarmentBtn).toBeEnabled();

    const [postGarmentRes] = await Promise.all([
      page
        .waitForResponse(
          (res) => res.url().includes('/api/garments') && res.request().method() === 'POST',
          { timeout: 10000 }
        )
        .catch(() => null),
      saveGarmentBtn.click(),
    ]);
    if (postGarmentRes && postGarmentRes.status() >= 400) {
      const errTxt = await postGarmentRes.text().catch(() => '');
      throw new Error(`POST /api/garments failed (${postGarmentRes.status()}): ${errTxt}`);
    }

    await expect(page.locator('.hig-cutout-tile')).toHaveCount(1);

    // Verify persisted garment format (.webp / data:image/webp) & outer/coat classification
    const serverGarmentsAfterAdd = await page.evaluate(
      async ({ closet, token }) => {
        const r = await fetch(`/api/garments?closet=${encodeURIComponent(closet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      { closet: userCloset, token: authToken }
    );
    expect(serverGarmentsAfterAdd.status).toBe(200);
    const addedList = serverGarmentsAfterAdd.body.garments || [];
    expect(addedList).toHaveLength(1);
    expect(addedList[0].category).toBe('outer');
    expect(addedList[0].slot_key).toBe('outer');
    expect(
      addedList[0].image_url.endsWith('.webp') ||
        addedList[0].image_url.startsWith('data:image/webp')
    ).toBe(true);

    // Wear in 3D Studio & verify activeGarmentIds on 3D engine (window.__MANNEQUIN_3D_ENGINE__)
    await page.locator('#mobile-tab-weather').click();
    await expect(page.locator('#studio-3d-canvas')).toBeVisible();

    await page.waitForFunction(
      () => {
        const eng =
          window.__MANNEQUIN_3D_ENGINE__ ||
          window.__ainventory3DEngine ||
          document.querySelector('#studio-3d-canvas')?.__mannequinEngine;
        if (eng && !window.__MANNEQUIN_3D_ENGINE__) {
          window.__MANNEQUIN_3D_ENGINE__ = eng;
        }
        return Boolean(eng && eng.getTelemetry().frameCount > 5);
      },
      null,
      { timeout: 15000 }
    );

    // Ensure uploaded coat is worn in activeGarmentIds (auto-equipped or via drawer outer slot)
    const hasEquippedInitially = await page.evaluate(
      () => (window.__MANNEQUIN_3D_ENGINE__?.getTelemetry()?.activeGarmentIds || []).length > 0
    );
    if (!hasEquippedInitially) {
      await page.locator('#studio-drawer-handle').click();
      await page.locator('#drawer-slot-chip-outer').click();
      await page.locator('.drawer-garment-tile').first().click();
      await page.locator('#studio-drawer-handle').click();
    }

    await page.waitForFunction(
      () => (window.__MANNEQUIN_3D_ENGINE__?.getTelemetry()?.activeGarmentIds || []).length >= 1,
      null,
      { timeout: 10000 }
    );
    const studioActiveGarmentIds = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__.getTelemetry().activeGarmentIds
    );
    expect(studioActiveGarmentIds.length).toBeGreaterThanOrEqual(1);
    expect(
      studioActiveGarmentIds.some(
        (id) => String(id).includes('outer') || Number(id) === Number(addedList[0].id)
      )
    ).toBe(true);

    // 3. Offline IndexedDB Cache & Automatic Background Sync
    // Warm Insights & Wardrobe IndexedDB caches before going offline
    await page.locator('#mobile-tab-wardrobe').click();
    await expect(page.locator('.hig-cutout-tile')).toHaveCount(1);
    await page.locator('#mobile-tab-analytics').click();
    await expect(page.locator('#bento-packing-card')).toBeVisible();

    await setBrowserOnline(false);

    // Verify IndexedDB cached wardrobe still loads while offline (GET /api/garments returns cached item)
    await page.locator('#mobile-tab-wardrobe').click();
    await expect(page.locator('.hig-cutout-tile')).toHaveCount(1);

    const idbCachedCount = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('ainventory_offline_v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise((resolve) => {
        const tx = db.transaction('kv_cache', 'readonly');
        const getReq = tx.objectStore('kv_cache').getAll();
        getReq.onsuccess = () => resolve(getReq.result || []);
        getReq.onerror = () => resolve([]);
      });
      db.close();
      const garmentEntries = rows.filter((r) => String(r.key || '').startsWith('/garments'));
      return garmentEntries.reduce((max, r) => Math.max(max, (r.data?.garments || []).length), 0);
    });
    expect(idbCachedCount).toBe(1);

    // Perform an offline mutation (create trip packing list) & verify IndexedDB mutation_queue queues it
    await page.locator('#mobile-tab-analytics').click();
    await page.locator('#bento-packing-card').click();
    const offlineTripTitle = `오프라인동기화_${Date.now()}`;
    await page.locator('#packing-title-input').fill(offlineTripTitle);
    await page.locator('#packing-dest-input').fill('부산');
    await page.locator('#create-packing-list-btn').click();
    await expect(page.getByText(new RegExp(offlineTripTitle))).toBeVisible();

    const queuedWhileOffline = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('ainventory_offline_v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const count = await new Promise((resolve) => {
        const tx = db.transaction('mutation_queue', 'readonly');
        const cReq = tx.objectStore('mutation_queue').count();
        cReq.onsuccess = () => resolve(Number(cReq.result) || 0);
        cReq.onerror = () => resolve(0);
      });
      db.close();
      return count;
    });
    expect(queuedWhileOffline).toBeGreaterThanOrEqual(1);

    // Restore online connectivity + dispatch `online` event -> verify automatic background sync to server
    await setBrowserOnline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    await page.waitForFunction(
      async () => {
        const db = await new Promise((resolve) => {
          const req = indexedDB.open('ainventory_offline_v1', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db) return false;
        const remaining = await new Promise((resolve) => {
          const tx = db.transaction('mutation_queue', 'readonly');
          const cReq = tx.objectStore('mutation_queue').count();
          cReq.onsuccess = () => resolve(Number(cReq.result) || 0);
          cReq.onerror = () => resolve(1);
        });
        db.close();
        return remaining === 0;
      },
      null,
      { timeout: 10000 }
    );

    const syncedPackingRes = await page.evaluate(
      async ({ closet, token }) => {
        const r = await fetch(`/api/packing-lists?closet=${encodeURIComponent(closet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      { closet: userCloset, token: authToken }
    );
    expect(syncedPackingRes.status).toBe(200);
    const serverLists =
      syncedPackingRes.body.lists || syncedPackingRes.body.packingLists || [];
    expect(serverLists.some((l) => l.title === offlineTripTitle)).toBe(true);

    // Close packing sheet before opening Account Settings
    await dismissOpenSheetByDragOrBackdrop(
      page,
      page.locator('#packing-title-input')
    );

    // 4. Immediate Permanent Account Deletion
    const accountSettingsBtn = page
      .locator(
        '#open-account-settings-btn:visible, #mobile-open-account-settings-btn:visible, #studio-open-settings-btn:visible'
      )
      .first();
    await expect(accountSettingsBtn).toBeVisible();
    await accountSettingsBtn.click();

    const openDeleteBtn = page
      .locator('#open-delete-account-modal-btn, #initiate-delete-account-btn')
      .first();
    await expect(openDeleteBtn).toBeVisible();
    await openDeleteBtn.click();

    const deleteConfirmInput = page.locator('#delete-account-confirm-input');
    if (await deleteConfirmInput.isVisible().catch(() => false)) {
      await deleteConfirmInput.fill('영구 탈퇴');
    }

    const confirmPermanentDeleteBtn = page
      .locator('#confirm-permanent-delete-btn, #delete-account-permanent-btn')
      .first();
    await expect(confirmPermanentDeleteBtn).toBeEnabled();
    await confirmPermanentDeleteBtn.click();

    // Assert immediate redirect to unauthenticated login screen & HTTP 401 on GET /api/auth/me
    await expect(page.locator('#enter-sample-demo-btn')).toBeVisible();

    const postDeleteAuthStatuses = await page.evaluate(async (oldToken) => {
      const r1 = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      const r2 = await fetch('/api/auth/me');
      return { withOldToken: r1.status, unauthenticated: r2.status };
    }, authToken);
    expect(postDeleteAuthStatuses.withOldToken).toBe(401);
    expect(postDeleteAuthStatuses.unauthenticated).toBe(401);
  });
});
