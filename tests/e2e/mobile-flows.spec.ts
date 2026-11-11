import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  CARBON_DOM_CONTRACT,
  CARBON_HIG_TOKENS,
} from '../../src/contracts/carbonDesignContract.ts';

/**
 * Unattended Mobile E2E Verification Suite (Requirement 15a + Apple HIG 11–14)
 * Executes across both `ios-notch` (393x852, DPR 3) and `android-foldable` (717x841, DPR 2.6) viewports.
 */

async function dismissOpenSheetByDragOrBackdrop(
  page: Page,
  targetLocator?: Locator
): Promise<void> {
  const handle = page
    .locator(`[${CARBON_DOM_CONTRACT.attrSheetHandle}="true"]:visible, .ui-sheet-drag-zone:visible`)
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
    const demoBtn = page.locator(`#${CARBON_DOM_CONTRACT.sampleDemoButtonId}`);
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toHaveAttribute('aria-label', CARBON_DOM_CONTRACT.sampleDemoAriaLabel);

    // 2. Verify Light (#FFFFFF) & Dark (#000000) pure monochrome canvas + system font stack + tabular-nums
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    if (initialTheme === 'dark') {
      await page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`).click();
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
    expect(lightSurfaceMetrics.fontVariantNumeric).toContain(CARBON_HIG_TOKENS.numericVariant);

    await page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`).click();
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(0, 0, 0)');

    // Restore Light mode before entering Sample Demo
    await page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgb(255, 255, 255)'
    );

    // 3. Enter Sample Demo Mode -> 3D Studio >= 85% viewport height, weather capsule & collapsed drawer
    await demoBtn.click();

    const studioScreen = page.locator(`.${CARBON_DOM_CONTRACT.studioScreenClass}`);
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studioCanvasId}`);
    const weatherCapsule = page.locator(`#${CARBON_DOM_CONTRACT.studioWeatherCapsuleId}`);
    const wardrobeDrawer = page.locator(`#${CARBON_DOM_CONTRACT.studioWardrobeDrawerId}`);

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

      if (!screenEl || !canvasEl || !handleEl || !weatherEl) {
        throw new Error('Required 3D Studio DOM elements missing');
      }

      const screenRect = screenEl.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();
      const handleRect = handleEl.getBoundingClientRect();
      const unobstructedHeight = Math.max(0, handleRect.top - screenRect.top);

      const drawerAria =
        drawerEl?.getAttribute('aria-expanded') ??
        handleEl.getAttribute('aria-expanded') ??
        (drawerEl?.getAttribute('data-drawer-state') === 'expanded' ? 'true' : 'false');

      return {
        studioViewportHeightRatio: screenRect.height / window.innerHeight,
        unobstructedViewportRatio: unobstructedHeight / window.innerHeight,
        canvasCoverageRatio:
          (canvasRect.width * canvasRect.height) / (screenRect.width * screenRect.height),
        drawerAria,
        drawerCollapsedClass: Boolean(
          drawerEl?.classList.contains('collapsed') ||
            drawerEl?.getAttribute('data-drawer-state') === 'collapsed'
        ),
        weatherFontVariantNumeric: getComputedStyle(weatherEl).fontVariantNumeric,
      };
    });

    expect(studioMetrics.studioViewportHeightRatio).toBeGreaterThanOrEqual(
      CARBON_HIG_TOKENS.minStudioViewportRatio
    );
    expect(studioMetrics.unobstructedViewportRatio).toBeGreaterThanOrEqual(
      CARBON_HIG_TOKENS.minStudioViewportRatio
    );
    expect(studioMetrics.canvasCoverageRatio).toBeGreaterThanOrEqual(0.95);
    expect(studioMetrics.drawerAria).toBe('false');
    expect(studioMetrics.drawerCollapsedClass).toBe(true);
    expect(studioMetrics.weatherFontVariantNumeric).toContain(CARBON_HIG_TOKENS.numericVariant);

    // 4. Navigate to Wardrobe -> Borderless cutout-only tiles, Spring Detail Sheet & Drag-to-Dismiss, Quick Menu
    await page.locator('#mobile-tab-wardrobe').click();
    const firstTile = page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`).first();
    await expect(firstTile).toBeVisible();

    const tileMetrics = await firstTile.evaluate((el) => {
      const htmlEl = el as HTMLElement;
      const cs = getComputedStyle(htmlEl);
      return {
        borderWidth: cs.borderWidth || cs.borderTopWidth,
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
        persistentTextLength: (htmlEl.innerText || '').trim().length,
        persistentButtonCount: htmlEl.querySelectorAll('button').length,
      };
    });
    expect(tileMetrics.borderWidth).toBe('0px');
    expect(tileMetrics.borderTopWidth).toBe('0px');
    expect(tileMetrics.boxShadow).toBe('none');
    expect(tileMetrics.persistentTextLength).toBe(0);
    expect(tileMetrics.persistentButtonCount).toBe(0);

    // Tap cutout tile -> opens #garment-detail-sheet with spring curve cubic-bezier(0.32, 0.72, 0, 1)
    await firstTile.click();
    const detailSheet = page.locator(`#${CARBON_DOM_CONTRACT.garmentDetailSheetId}`);
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
    if (!detailSpringInfo) {
      throw new Error('Missing detail sheet panel');
    }
    expect(
      `${detailSpringInfo.transitionTimingFunction} ${detailSpringInfo.animationTimingFunction} ${detailSpringInfo.springVar}`
    ).toContain(CARBON_HIG_TOKENS.springEasing);

    // Downward drag on [data-sheet-handle="true"] (or sheet drag zone) dismisses #garment-detail-sheet
    await page.waitForTimeout(460); // Let 0.42s spring entrance settle so handle coordinates are stationary
    const sheetHandle = page
      .locator(`[${CARBON_DOM_CONTRACT.attrSheetHandle}="true"]:visible, .ui-sheet-drag-zone:visible`)
      .last();
    await expect(sheetHandle).toBeVisible();
    const handleBox = await sheetHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) {
      throw new Error('Missing sheet handle bounding box');
    }
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
    const quickMenuSheet = page.locator(`#${CARBON_DOM_CONTRACT.garmentQuickMenuSheetId}`);
    await expect(quickMenuSheet).toBeVisible();
    await dismissOpenSheetByDragOrBackdrop(page, quickMenuSheet);
    await expect(quickMenuSheet).toBeHidden();

    // 5. Navigate to Insights -> Bento summary cards borderless/shadowless + tabular-nums + drill-down sheet
    await page.locator('#mobile-tab-analytics').click();

    const cpwCard = page.locator(`#${CARBON_DOM_CONTRACT.bentoCpwCardId}`);
    const utilizationCard = page.locator(`#${CARBON_DOM_CONTRACT.bentoUtilizationCardId}`);
    const packingCard = page.locator(`#${CARBON_DOM_CONTRACT.bentoPackingCardId}`);

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
      expect(cardStyle.fontVariantNumeric).toContain(CARBON_HIG_TOKENS.numericVariant);
    }

    // Tap #bento-cpw-card -> opens drill-down bottom sheet
    await cpwCard.click();
    const drilldownSheetPanel = page
      .locator(`[${CARBON_DOM_CONTRACT.attrSheetPanel}="true"]:visible, .ui-sheet-box:visible`)
      .first();
    await expect(drilldownSheetPanel).toBeVisible();
    const drilldownEasing = await drilldownSheetPanel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.transitionTimingFunction} ${cs.animationTimingFunction}`;
    });
    expect(drilldownEasing).toContain(CARBON_HIG_TOKENS.springEasing);
    await dismissOpenSheetByDragOrBackdrop(page, drilldownSheetPanel);
  });

  test('2. Full Authenticated Lifecycle: Email OTP Signup -> Empty Closet -> Synthetic Coat WebP Cutout & 3D Wear -> Offline IndexedDB Cache & Sync -> Immediate Permanent Account Deletion', async ({
    page,
    context,
  }) => {
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Network.enable');
    const setBrowserOnline = async (online: boolean): Promise<void> => {
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

    const registerTab = page.locator('#auth-tab-register');
    if (await registerTab.isVisible().catch(() => false)) {
      await registerTab.click();
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
    const otpDispatchJson = (await otpDispatchRes.json().catch(() => ({}))) as {
      devPreviewCode?: string;
      verificationCode?: string;
      verification?: { code?: string };
      code?: string;
    };
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
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studioCanvasId}`)).toBeVisible();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studioEmptyClosetCardId}`)).toBeVisible();

    const { authToken, userCloset } = await page.evaluate(async () => {
      const token = localStorage.getItem('ainventory_auth_token') || '';
      const meRes = await fetch('/api/auth/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const meJson = (await meRes.json().catch(() => ({}))) as {
        user?: { defaultCloset?: string };
      };
      return {
        authToken: token,
        userCloset: meJson.user?.defaultCloset || '',
      };
    });
    expect(authToken.length).toBeGreaterThan(10);
    expect(userCloset).toBeTruthy();

    await page.locator('#mobile-tab-wardrobe').click();
    await expect(page.getByText(/비어 있습니다|빈 옷장/).first()).toBeVisible();
    await expect(page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`)).toHaveCount(0);

    // 2. Upload synthetic dark-navy long coat on bright background -> auto WebP cutout & AI outer/coat mapping
    const openAddBtn = page
      .locator(`#open-garment-add-btn, #${CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}`)
      .first();
    await expect(openAddBtn).toBeVisible();
    await openAddBtn.click();

    const syntheticCoatBase64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 520;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable');
      // Clean bright studio background (#F8F8FA)
      ctx.fillStyle = '#F8F8FA';
      ctx.fillRect(0, 0, c.width, c.height);
      // High-aspect solid dark navy long coat silhouette (realAspect > 2.0, zero lower split gap)
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(118, 56, 124, 384);
      ctx.fillRect(92, 74, 28, 224);
      ctx.fillRect(240, 74, 28, 224);
      return c.toDataURL('image/png').split(',')[1] || '';
    });

    const photoInput = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeGalleryInputId}`);
    await photoInput.setInputFiles({
      name: 'synthetic-navy-coat.png',
      mimeType: 'image/png',
      buffer: Buffer.from(syntheticCoatBase64, 'base64'),
    });

    // Confirm SmartPhotoCropEditorModal if opened
    const confirmCropBtn = page.locator(`#${CARBON_DOM_CONTRACT.confirmSmartCropBtnId}`);
    try {
      await confirmCropBtn.waitFor({ state: 'visible', timeout: 3000 });
      await confirmCropBtn.click();
    } catch {
      // Direct WebP pipeline without intermediate crop step
    }

    // Verify automatic background removal produces image/webp
    const webpPreview = page
      .locator(
        `#${CARBON_DOM_CONTRACT.croppedWebpPreviewImgId}, img[src^="data:image/webp"], img[src$=".webp"]`
      )
      .first();
    await expect(webpPreview).toBeVisible();
    const previewSrc = (await webpPreview.getAttribute('src')) || '';
    expect(
      previewSrc.startsWith('data:image/webp') || previewSrc.toLowerCase().endsWith('.webp')
    ).toBe(true);

    // Verify AI slot mapping auto-classifies coat / outer
    const mappingBadge = page.locator(`#${CARBON_DOM_CONTRACT.aiGarmentMappingSummaryId}`);
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

    const saveGarmentBtn = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}`);
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

    await expect(page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`)).toHaveCount(1);

    // Verify persisted garment format (.webp / data:image/webp) & outer/coat classification
    const serverGarmentsAfterAdd = await page.evaluate(
      async ({ closet, token }) => {
        const r = await fetch(`/api/garments?closet=${encodeURIComponent(closet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await r.json().catch(() => ({}))) as {
          garments?: Array<{
            id: number;
            category: string;
            slot_key?: string;
            image_url: string;
          }>;
        };
        return { status: r.status, body };
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
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studioCanvasId}`)).toBeVisible();

    await page.waitForFunction(
      () => {
        const canvasEl = document.querySelector('#studio-3d-canvas') as HTMLCanvasElement | null;
        const eng =
          window.__MANNEQUIN_3D_ENGINE__ ||
          window.__ainventory3DEngine ||
          canvasEl?.__mannequinEngine;
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
      await page.locator(`#${CARBON_DOM_CONTRACT.studioDrawerHandleId}`).click();
      await page.locator('#drawer-slot-chip-outer').click();
      await page.locator('.drawer-garment-tile').first().click();
      await page.locator(`#${CARBON_DOM_CONTRACT.studioDrawerHandleId}`).click();
    }

    await page.waitForFunction(
      () => (window.__MANNEQUIN_3D_ENGINE__?.getTelemetry()?.activeGarmentIds || []).length >= 1,
      null,
      { timeout: 10000 }
    );
    const studioActiveGarmentIds = await page.evaluate(
      () => window.__MANNEQUIN_3D_ENGINE__?.getTelemetry().activeGarmentIds ?? []
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
    await expect(page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`)).toHaveCount(1);
    await page.locator('#mobile-tab-analytics').click();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.bentoPackingCardId}`)).toBeVisible();

    await setBrowserOnline(false);

    // Verify IndexedDB cached wardrobe still loads while offline (GET /api/garments returns cached item)
    await page.locator('#mobile-tab-wardrobe').click();
    await expect(page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`)).toHaveCount(1);

    const idbCachedCount = await page.evaluate(async () => {
      interface KvCacheRow {
        key?: string;
        data?: { garments?: unknown[] };
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ainventory_offline_v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise<KvCacheRow[]>((resolve) => {
        const tx = db.transaction('kv_cache', 'readonly');
        const getReq = tx.objectStore('kv_cache').getAll();
        getReq.onsuccess = () => resolve((getReq.result as KvCacheRow[]) || []);
        getReq.onerror = () => resolve([]);
      });
      db.close();
      const garmentEntries = rows.filter((r) => String(r.key || '').includes('/garments'));
      return garmentEntries.reduce((max, r) => Math.max(max, (r.data?.garments || []).length), 0);
    });
    expect(idbCachedCount).toBe(1);

    // Perform an offline mutation (create trip packing list) & verify IndexedDB mutation_queue queues it
    await page.locator('#mobile-tab-analytics').click();
    await page.locator(`#${CARBON_DOM_CONTRACT.bentoPackingCardId}`).click();
    const offlineTripTitle = `오프라인동기화_${Date.now()}`;
    await page.locator(`#${CARBON_DOM_CONTRACT.packingTitleInputId}`).fill(offlineTripTitle);
    await page.locator(`#${CARBON_DOM_CONTRACT.packingDestInputId}`).fill('부산');
    await page.locator(`#${CARBON_DOM_CONTRACT.createPackingListBtnId}`).click();
    await expect(page.getByText(new RegExp(offlineTripTitle))).toBeVisible();

    const queuedWhileOffline = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ainventory_offline_v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const count = await new Promise<number>((resolve) => {
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
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const req = indexedDB.open('ainventory_offline_v1', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db) return false;
        const remaining = await new Promise<number>((resolve) => {
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
        const body = (await r.json().catch(() => ({}))) as {
          lists?: Array<{ title?: string }>;
          packingLists?: Array<{ title?: string }>;
        };
        return { status: r.status, body };
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
      page.locator(`#${CARBON_DOM_CONTRACT.packingTitleInputId}`)
    );

    // 4. Immediate Permanent Account Deletion
    const accountSettingsBtn = page
      .locator(
        `#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}:visible, #${CARBON_DOM_CONTRACT.mobileOpenAccountSettingsBtnId}:visible, #studio-open-settings-btn:visible`
      )
      .first();
    await expect(accountSettingsBtn).toBeVisible();
    await accountSettingsBtn.click();

    const openDeleteBtn = page.locator(`#${CARBON_DOM_CONTRACT.initiateDeleteAccountBtnId}`);
    await expect(openDeleteBtn).toBeVisible();
    await openDeleteBtn.click();

    const confirmPermanentDeleteBtn = page.locator(
      `#${CARBON_DOM_CONTRACT.confirmPermanentDeleteBtnId}`
    );
    await expect(confirmPermanentDeleteBtn).toBeEnabled();
    await confirmPermanentDeleteBtn.click();

    // Assert immediate redirect to unauthenticated login screen & HTTP 401 on GET /api/auth/me
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.sampleDemoButtonId}`)).toBeVisible();

    const postDeleteAuthStatuses = await page.evaluate(async (oldToken) => {
      const r1 = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      const r2 = await fetch('/api/auth/me');
      return { withOldToken: r1.status, unauthenticated: r2.status };
    }, authToken);
    expect(postDeleteAuthStatuses.withOldToken).toBe(401);
    expect(postDeleteAuthStatuses.unauthenticated).toBe(401);

    // Verify local auth token & IndexedDB offline stores (`kv_cache` & `mutation_queue`) are completely purged
    const localPurgeState = await page.evaluate(async () => {
      const remainingToken = localStorage.getItem('ainventory_auth_token');
      let remainingCacheCount = 0;
      let remainingQueueCount = 0;

      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        const exists = dbs.some((d) => d.name === 'ainventory_offline_v1');
        if (!exists) {
          return { remainingToken, remainingCacheCount: 0, remainingQueueCount: 0 };
        }
      }

      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open('ainventory_offline_v1', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (db) {
        if (db.objectStoreNames.contains('kv_cache')) {
          remainingCacheCount = await new Promise<number>((resolve) => {
            const tx = db.transaction('kv_cache', 'readonly');
            const cReq = tx.objectStore('kv_cache').count();
            cReq.onsuccess = () => resolve(Number(cReq.result) || 0);
            cReq.onerror = () => resolve(0);
          });
        }
        if (db.objectStoreNames.contains('mutation_queue')) {
          remainingQueueCount = await new Promise<number>((resolve) => {
            const tx = db.transaction('mutation_queue', 'readonly');
            const cReq = tx.objectStore('mutation_queue').count();
            cReq.onsuccess = () => resolve(Number(cReq.result) || 0);
            cReq.onerror = () => resolve(0);
          });
        }
        db.close();
      }
      return { remainingToken, remainingCacheCount, remainingQueueCount };
    });
    expect(localPurgeState.remainingToken || '').toBe('');
    expect(localPurgeState.remainingCacheCount).toBe(0);
    expect(localPurgeState.remainingQueueCount).toBe(0);
  });
});
