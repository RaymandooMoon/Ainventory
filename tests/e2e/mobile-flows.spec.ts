import zlib from 'node:zlib';
import { expect, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

/**
 * Generates a valid 64x64 PNG buffer (navy garment core on #F5F5F7 studio border)
 * so client-side background removal + 1:1 normalization produces a real transparent cutout.
 */
function createTestGarmentPngBuffer(): Buffer {
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < w; x++) {
      const px = rowStart + 1 + x * 4;
      const isCore = x >= 14 && x < 50 && y >= 10 && y < 54;
      raw[px] = isCore ? 0x23 : 0xf5;
      raw[px + 1] = isCore ? 0x31 : 0xf5;
      raw[px + 2] = isCore ? 0x49 : 0xf7;
      raw[px + 3] = 0xff;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('Apple HIG Inventory-First IA & 2.5D Pipeline E2E', () => {
  test('1. Default Outfits home, top-left brand non-overlap, Closet squircle 2.5D grid without MY WARDROBE, and zero 3D/MediaPipe loads', async ({
    page,
  }) => {
    const forbiddenAssetRequests: string[] = [];
    const pageErrors: string[] = [];

    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (url.endsWith('.glb') || url.endsWith('.wasm') || url.endsWith('.task')) {
        forbiddenAssetRequests.push(url);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Default Home is Outfits with top-left iNVTRY brand mark clear of utility actions
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`)).toBeVisible();
    const headerBrand = page.locator('.hig-top-bar [data-brand-logo="true"]');
    await expect(headerBrand).toBeVisible();

    const headerGeometry = await page.evaluate(() => {
      const brand = document.querySelector('.hig-top-bar [data-brand-logo="true"]');
      const actions = document.querySelector('.hig-top-bar-actions');
      const bRect = brand?.getBoundingClientRect();
      const aRect = actions?.getBoundingClientRect();
      return bRect && aRect
        ? { brandRight: bRect.right, actionsLeft: aRect.left, gap: aRect.left - bRect.right }
        : null;
    });
    expect(headerGeometry).not.toBeNull();
    expect(headerGeometry!.gap).toBeGreaterThanOrEqual(4);

    // Unified Bottom-Center Floating Glassmorphism 4-Tab Bar puts Outfits first, then Closet, Calendar, Stats
    const tabs = page.locator(`#${CARBON_DOM_CONTRACT.floatingTabBarId} button`);
    await expect(tabs).toHaveText(['Outfits', 'Closet', 'Calendar', 'Stats']);

    // Navigate to Closet (`/closet`) and verify MY WARDROBE is removed while item count remains visible
    await tabs.nth(1).click();
    await expect(page).toHaveURL(/\/closet$/);
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeHeaderTitleId}`)).toHaveCount(0);

    const countEl = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeItemCountId}`);
    await expect(countEl).toHaveText(/^\d+ ITEMS$/);
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}`)).toBeVisible();

    // 2. Exact 7 Pill Category Filters (single axis, Jewelry included)
    const pills = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeCategoryRailId} button`);
    await expect(pills).toHaveText([
      'All',
      'Tops',
      'Bottoms',
      'Outerwear',
      'Shoes',
      'Accessories',
      'Jewelry',
    ]);

    // 3. Squircle #F5F5F7 cards with zero SVG placeholder wireframes
    const firstSquircle = page.locator(`.${CARBON_DOM_CONTRACT.cutoutTileClass}`).first();
    await expect(firstSquircle).toBeVisible();
    const squircleStyle = await firstSquircle.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        radius: parseFloat(cs.borderTopLeftRadius),
        svgCount: el.querySelectorAll('svg').length,
      };
    });
    expect(squircleStyle.bg).toBe('rgb(245, 245, 247)');
    expect(squircleStyle.radius).toBeGreaterThanOrEqual(20);
    expect(squircleStyle.radius).toBeLessThanOrEqual(24);
    expect(squircleStyle.svgCount).toBe(0);

    // 4. Zero prohibited editorial copy & zero 3D/WASM requests
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('MY WARDROBE');
    expect(bodyText).not.toContain('비워진 공간');
    expect(bodyText).not.toContain('SPATIAL FITTING');
    expect(bodyText).not.toContain('평균 완성도');
    expect(bodyText).not.toContain('오늘의 기온');
    expect(forbiddenAssetRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Full User Flow: + Register -> Grid Exposure -> /item/:id Detail (2.5D Tilt & Edit) -> Outfits Studio Combination -> Delete', async ({
    page,
  }) => {
    await page.goto('/closet');

    // Wait for initial wardrobe garments fetch to settle before reading baseline count
    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.wardrobeGridId} .hig-wardrobe-card`).first()
    ).toBeVisible();

    const countEl = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeItemCountId}`);
    await expect(countEl).toHaveText(/^[1-9]\d* ITEMS$/);
    const initialCountText = await countEl.innerText();
    const initialCount = Number.parseInt(initialCountText, 10);

    // Step A: Register new garment via '+' modal
    await page.locator(`#${CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}`).click();

    const fileInput = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeGalleryInputId}`);
    await fileInput.setInputFiles({
      name: 'navy-trench-coat.png',
      mimeType: 'image/png',
      buffer: createTestGarmentPngBuffer(),
    });

    // Wait for 1:1 2.5D preview cutout to appear
    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.addGarmentPreviewId} .garment-object-25d img`)
    ).toBeVisible();

    await page
      .locator('.hig-add-garment-form [role="radiogroup"] button', { hasText: 'Outerwear' })
      .click();
    await page.locator('#add-garment-name-input').fill('Studio Gabardine Trench');
    await page.locator('#add-garment-brand-input').fill('Lemaire');
    await page.locator(`#${CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}`).click();

    // Step B: Verify immediate exposure in MY WARDROBE grid & incremented item count
    await expect(countEl).toHaveText(`${initialCount + 1} ITEMS`);
    const registeredCard = page
      .locator(`#${CARBON_DOM_CONTRACT.wardrobeGridId} .hig-wardrobe-card`, {
        hasText: 'Studio Gabardine Trench',
      })
      .first();
    await expect(registeredCard).toBeVisible();
    await expect(registeredCard).toContainText('Lemaire');

    // Step C: Click garment card -> navigates to `/item/:id` Item Detail view
    await registeredCard.click();
    await expect(page).toHaveURL(/\/item\/-?\d+$/);
    const detailSheet = page.locator(`#${CARBON_DOM_CONTRACT.garmentDetailSheetId}`);
    await expect(detailSheet).toBeVisible();

    // Verify 2.5D tilt responsiveness on pointer move
    const tiltStage = page.locator(`#${CARBON_DOM_CONTRACT.itemDetailTiltStageId}`);
    const box = await tiltStage.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
      const tiltX = Number(await tiltStage.getAttribute('data-tilt-x'));
      expect(Math.abs(tiltX)).toBeGreaterThan(1);
    }

    // Edit metadata (Brand, Size, Memo) & Save
    await page.locator('#detail-brand-input').fill('Lemaire Paris');
    await page.locator('#detail-size-input').fill('L');
    await page.locator('#detail-memo-input').fill('2.5D Studio Trench Test');
    await page.locator(`#${CARBON_DOM_CONTRACT.itemDetailSaveBtnId}`).click();

    // Step D: Click `[Outfits에서 코디해보기]` -> navigates to `/outfits` with garment pre-equipped on 2.5D Studio Canvas
    await page.locator(`#${CARBON_DOM_CONTRACT.itemDetailTryOutfitBtnId}`).click();
    await expect(page).toHaveURL(/\/outfits$/);

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();

    // Combine an Accessories slot item via mobile bottom sheet or desktop right panel
    const mobileAccSlotBtn = page.locator('[data-mobile-slot-btn="accessory"]');
    if (await mobileAccSlotBtn.isVisible()) {
      await mobileAccSlotBtn.click();
      await page.locator('.ui-sheet-box [data-slot-garment-id]').first().click();
    } else {
      await page.locator('[data-outfit-slot-tab="accessory"]').click();
      await page
        .locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId} [data-slot-garment-id]`)
        .first()
        .click();
    }
    await expect(studioCanvas.locator('[data-studio-slot="accessory"]')).toBeVisible();

    // Save combined outfit
    const mobileSaveBtn = page.getByTestId('mobile-save-outfit-btn');
    if (await mobileSaveBtn.isVisible()) {
      await page.locator('.studio-mobile-save-row input').fill('Minimal Trench Coordi');
      await mobileSaveBtn.click();
    } else {
      await page.locator('.studio-save-bar input').fill('Minimal Trench Coordi');
      await page.locator(`#${CARBON_DOM_CONTRACT.studioSaveOutfitBtnId}`).click();
    }

    // Step E: Return to Closet -> open registered item detail -> Delete item
    await page.locator('[data-nav-tab="closet"]').click();
    await expect(page).toHaveURL(/\/closet$/);
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeItemCountId}`)).toBeVisible();

    const updatedCard = page
      .locator(`#${CARBON_DOM_CONTRACT.wardrobeGridId} .hig-wardrobe-card`, {
        hasText: 'Studio Gabardine Trench',
      })
      .first();
    await expect(updatedCard).toContainText('Lemaire Paris');
    await updatedCard.click();

    await expect(page.locator('#detail-size-input')).toHaveValue('L');
    await page.locator(`#${CARBON_DOM_CONTRACT.itemDetailDeleteBtnId}`).click();

    await expect(countEl).toHaveText(`${initialCount} ITEMS`);
  });

  test('3. Calendar & Stats tabs, Dark Mode 2.5D styling, and Account Deletion compliance', async ({
    page,
  }) => {
    await page.goto('/');

    // Calendar tab
    await page.locator('[data-nav-tab="calendar"]').click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.locator('.hig-screen-title')).toHaveText('CALENDAR');

    // Stats tab & Dark Mode toggle
    await page.locator('[data-nav-tab="stats"]').click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.locator('.hig-screen-title')).toHaveText('STATS');

    await page.getByRole('button', { name: '다크 모드로 전환' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Verify Account Settings Sheet -> Login View with Pure JS+CSS Wardrobe-to-Inventory Motion Stage (zero <video>)
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await expect(page.locator('#account-logout-btn')).toBeVisible();
    await page.locator('#account-logout-btn').click();

    const motionStage = page.locator(`#${CARBON_DOM_CONTRACT.loginMotionStageId}`);
    await expect(motionStage).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'dark');
    await expect(motionStage.locator('#wardrobe-optical-scanner')).toHaveCount(0);
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.introGetStartedBtnId}`)).toBeVisible();

    await page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(motionStage).toHaveAttribute('data-motion-theme', 'light');
  });

  test('4. Tomorrow Weather AI Outfit Styling on 2.5D Character & Portrait Skin-Tone Mannequin Switching', async ({
    page,
  }) => {
    const forbiddenAssetRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (url.endsWith('.wasm') || url.endsWith('.task')) {
        forbiddenAssetRequests.push(url);
      }
    });

    await page.goto('/outfits');

    // 1. Upper weather bar is removed above stage; Weather Capsule + Bottom-Right Look 1/2 Dock live on stage
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await expect(weatherPanel).toHaveCount(0);

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const mannequin = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(mannequin).toBeVisible();
    await expect(mannequin.locator('.character-25d-fallback-svg')).toHaveCount(0);
    await expect(mannequin).toHaveAttribute('data-viewer-mode', '2d-vton');
    await expect(
      mannequin.locator(
        '[data-vton-after-img="true"], canvas.character-25d-render-canvas[data-body-ready="true"]'
      )
    ).toBeVisible();

    await expect(
      studioCanvas.locator('[data-weather-look-dock="true"] [data-weather-rec-id]').first()
    ).toBeVisible();

    const weatherCapsule = studioCanvas.locator('[data-atelier-weather-capsule="true"]');
    await expect(weatherCapsule).toBeVisible();
    await expect(weatherCapsule).toContainText('서울');
    await expect(weatherCapsule).toContainText(/°C/);
    await expect(weatherCapsule.locator('[data-weather-capsule-datetime="true"]')).toContainText(
      /오늘\s+\d{1,2}\.\d{1,2}\([일월화수목금토]\)\s+\d{2}:\d{2}/
    );
    await expect(studioCanvas).toHaveAttribute('data-day-target', 'today');

    // Wait for Today's Weather #1 recommendation to dress the 2D VTON model
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();

    // 2. Open unified Weather · Location · Look 1/2 popup via capsule and verify Today default + 비 -> 예보 clearing + Warm Spring
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
    const vpSize = page.viewportSize();
    const panelBox = await weatherPanel.boundingBox();
    expect(panelBox).not.toBeNull();
    if (panelBox && vpSize) {
      expect(panelBox.y).toBeGreaterThanOrEqual(0);
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(vpSize.height + 1);
    }
    await expect(weatherPanel).toContainText('오늘 날씨 코디');
    await expect(weatherPanel.locator('[data-weather-source-caption="true"]')).toContainText(
      'Open-Meteo'
    );
    await expect(weatherPanel.locator('select.weather-city-select')).toBeVisible();
    await expect(weatherPanel.locator('button[data-weather-scenario="live"]')).toBeVisible();
    const weatherScenarioSelect = weatherPanel.locator(
      'select[data-weather-scenario-select="true"]'
    );
    await expect(weatherScenarioSelect).toBeVisible();
    await expect(weatherScenarioSelect.locator('option[data-weather-scenario]')).toHaveCount(8);
    await expect(weatherPanel.locator('select[data-look-style-select="1"]')).toHaveValue(
      'business_casual'
    );
    await expect(weatherPanel.locator('select[data-look-style-select="2"]')).toHaveValue(
      'comfortable_casual'
    );
    await expect(weatherPanel.locator('.weather-popup-look-items')).toHaveCount(0);

    // Switch to `비` (`rainy_cool`) -> verify rain activates -> switch back to `예보` (`live`) -> rain & auto umbrella clear cleanly
    await weatherScenarioSelect.selectOption('rainy_cool');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-25d-rain-layer')).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();

    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel.locator('button[data-weather-scenario="live"]').click();
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-25d-rain-layer')).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-effective-weather', /^(clear|cloudy|wind)$/);

    await weatherCapsule.click();
    await expect(weatherPanel).toBeVisible();
    await weatherPanel
      .locator('select[data-weather-scenario-select="true"]')
      .selectOption('warm_spring');
    await page.keyboard.press('Escape');
    await expect(weatherPanel).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-25d-rain-layer')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toHaveCount(0);

    // 3. Bottom skin/height controls must be removed from /outfits stage and unified in Top Profile modal
    await expect(studioCanvas.locator('[data-quick-skin-preset]')).toHaveCount(0);
    await expect(studioCanvas.locator('#open-body-spec-btn')).toHaveCount(0);
    await expect(studioCanvas.locator('.studio-25d-tone-dock')).toHaveCount(0);

    // 4. Unified Top Profile Modal -> Portrait Skin-Tone Analyzer + Height Validation Error Modal + Body Shape
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(page.locator('#profile-tab-skin')).toBeVisible();
    await expect(page.locator('#profile-tab-body')).toBeVisible();
    await expect(page.locator('.skin-gender-pill')).toHaveCount(0);
    await expect(page.locator('.avatar-config-hash-badge')).toHaveCount(0);
    await expect(page.locator('.body-spec-account-badge')).toHaveCount(0);
    await expect(page.locator('[data-lighting-mode]')).toHaveCount(0);
    await expect(page.locator('.skin-lab-metrics')).toHaveCount(0);

    // Direct height input validation: out-of-range value triggers centered role="alertdialog" error modal
    const heightInput = page.locator('[data-height-cm-input="true"]');
    await expect(heightInput).toBeVisible();
    await heightInput.fill('260');
    await heightInput.press('Enter');
    const errorModal = page.locator('[data-profile-error-modal="true"]');
    await expect(errorModal).toBeVisible();
    await expect(errorModal).toHaveAttribute('role', 'alertdialog');
    await expect(errorModal.locator('[data-profile-error-message="true"]')).toContainText(
      /100cm ~ 230cm|100cm – 230cm/
    );
    await errorModal.locator('[data-profile-error-confirm="true"]').click();
    await expect(errorModal).toHaveCount(0);

    await heightInput.fill('178');

    await page.locator('[data-sample-toggle="true"]').click();
    await page.locator('[data-sample-portrait="spring_warm"]').click();

    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);
    await expect(page.locator('[data-lighting-mode]')).toHaveCount(4);
    await expect(page.locator('.skin-lab-metrics')).toHaveCount(0);

    await page.locator('[data-skin-metrics-toggle="true"]').click();
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toContainText('ITA°');

    await page.locator('#profile-tab-body').click();
    await expect(page.locator('[data-body-gender-btn]')).toHaveCount(0);
    await page.locator('[data-body-shape-btn="muscular"]').click();
    await page.locator('#apply-body-spec-btn').click();

    await expect(mannequin).toHaveAttribute('data-personal-color', 'spring_warm');
    await expect(mannequin).toHaveAttribute('data-body-shape', 'muscular');
    await expect(mannequin).toHaveAttribute('data-height-cm', '178');

    // 5. 2D VTON Viewer Inspection (zero 3D camera orbit pills, zero zoom buttons/badge, compact Background Picker HUD + pinch zoom)
    await expect(studioCanvas.locator('[data-camera-preset-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-iso-rotate-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-angle-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-compare-btn]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-out]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-level="true"]')).toHaveCount(0);
    await expect(
      studioCanvas.locator('.studio-hud-left-slot [data-stage-bg-picker-btn="true"]')
    ).toBeVisible();

    await page.getByRole('button', { name: /피팅 새로고침|Refresh/i }).click();
    await studioCanvas.locator('[data-vton-demo-btn="true"]').click();
    const demoAiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(demoAiImg).toBeVisible();
    await expect(studioCanvas.locator('[data-vton-zoom-in]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-out]')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-vton-zoom-level="true"]')).toHaveCount(0);

    const bgBadgeBtn = studioCanvas.locator(
      '.studio-hud-left-slot [data-stage-bg-picker-btn="true"]'
    );
    await expect(bgBadgeBtn).toBeVisible();
    await expect(bgBadgeBtn).toHaveAttribute('data-stage-bg-tier', 'C');
    const box10 = await demoAiImg.boundingBox();
    expect(box10).not.toBeNull();

    // Verify 2-finger pinch zoom scales character smoothly (`1.00 -> 1.35 -> 1.00`)
    await mannequin.evaluate((stageEl) => {
      const rect = stageEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      const emit = (type: 'touchstart' | 'touchmove' | 'touchend', halfSpanPx: number | null) => {
        const pts =
          halfSpanPx === null
            ? []
            : [
                { id: 1, x: midX - halfSpanPx, y: midY },
                { id: 2, x: midX + halfSpanPx, y: midY },
              ];
        const tl = pts.map(
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
            touches: tl,
            targetTouches: tl,
            changedTouches: tl,
          })
        );
      };
      emit('touchstart', 50);
      emit('touchmove', 67.5);
      emit('touchend', null);
    });
    await expect(mannequin).toHaveAttribute('data-zoom', '1.35');
    await expect
      .poll(
        async () => {
          const box = await demoAiImg.boundingBox();
          return box ? box.width / box10!.width : 0;
        },
        { timeout: 2500 }
      )
      .toBeGreaterThanOrEqual(1.25);

    await mannequin.evaluate((stageEl) => {
      const rect = stageEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      const emit = (type: 'touchstart' | 'touchmove' | 'touchend', halfSpanPx: number | null) => {
        const pts =
          halfSpanPx === null
            ? []
            : [
                { id: 1, x: midX - halfSpanPx, y: midY },
                { id: 2, x: midX + halfSpanPx, y: midY },
              ];
        const tl = pts.map(
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
            touches: tl,
            targetTouches: tl,
            changedTouches: tl,
          })
        );
      };
      emit('touchstart', 80);
      emit('touchmove', 50);
      emit('touchend', null);
    });
    await expect(mannequin).toHaveAttribute('data-zoom', '1.00');

    // Unequipping Tops leaves an unbroken 2D editorial base model
    await studioCanvas.locator('[data-studio-slot="top"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toHaveCount(0);
    await expect(mannequin).toBeVisible();

    // 6. Unmount -> Remount lifecycle regression guard
    const tabBar = page.locator(`#${CARBON_DOM_CONTRACT.floatingTabBarId}`);
    await tabBar.getByRole('button', { name: 'Closet' }).click();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeItemCountId}`)).toBeVisible();
    await tabBar.getByRole('button', { name: 'Outfits' }).click();
    await expect(mannequin.locator('.character-25d-fallback-svg')).toHaveCount(0);
    await expect(
      mannequin.locator(
        '[data-vton-after-img="true"], canvas.character-25d-render-canvas[data-body-ready="true"]'
      )
    ).toBeVisible();

    expect(forbiddenAssetRequests).toEqual([]);
  });

  test('5. Signup anthropometric info automatically configures the gender-neutral 2D model', async ({
    page,
  }) => {
    await page.goto('/?auth=1');

    const getStartedBtn = page.locator(`#${CARBON_DOM_CONTRACT.introGetStartedBtnId}`);
    await expect(getStartedBtn).toBeVisible();
    await getStartedBtn.click();

    await page.locator(`#${CARBON_DOM_CONTRACT.authTabRegisterId}`).click();
    const uniqueEmail = `female.avatar.${Date.now()}@example.com`;
    await page.locator('#register-email-input').fill(uniqueEmail);
    await page.locator('#send-otp-btn').click();

    // Local dev mode auto-fills OTP code; click Verify
    await expect(page.locator('#verify-otp-btn')).toBeVisible();
    await page.locator('#verify-otp-btn').click();
    await expect(page.locator('#verify-otp-btn')).toContainText('인증됨');

    // Select signup option + 165cm + 53kg at signup
    await page.locator('[data-signup-gender="female"]').click();
    await page.locator('#register-name-input').fill('서연');
    await page.locator('#register-height-input').fill('165');
    await page.locator('#register-weight-input').fill('53');
    await page.locator('#register-password-input').fill('pass1234');
    await page.locator('#complete-register-btn').click();

    // Lands directly on Outfits (`/`) with top-left brand logo and gender-neutral 2D model + 165cm + 53kg
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.hig-top-bar [data-brand-logo="true"]')).toBeVisible();

    const mannequin = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(mannequin).toBeVisible();
    await expect(mannequin).toHaveAttribute('data-viewer-mode', '2d-vton');
    await expect(mannequin).toHaveAttribute('data-height-cm', '165');
    await expect(mannequin).toHaveAttribute('data-weight-kg', '53');

    // Clean up test user account immediately (accessible from top-right right here on Outfits!)
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await page.locator(`#${CARBON_DOM_CONTRACT.initiateDeleteAccountBtnId}`).click();
    await page.locator(`#${CARBON_DOM_CONTRACT.confirmPermanentDeleteBtnId}`).click();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.loginMotionStageId}`)).toBeVisible();
  });

  test('6. Bilingual i18n, bright Light Mode cards, top-right Account/Profile everywhere, zero 2.5D copy, and half-body portrait face detection', async ({
    page,
  }) => {
    // Build a realistic 240x360 half-body portrait: small upper face + dark hair + large mint-green top (#68C2A8)
    const w = 240;
    const h = 360;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      const rowStart = y * (w * 4 + 1);
      raw[rowStart] = 0;
      for (let x = 0; x < w; x++) {
        const px = rowStart + 1 + x * 4;
        // Default bright studio wall (#F3F4F6)
        let r = 243;
        let g = 244;
        let b = 246;

        // Large mint-green shirt across chest & lower frame (#68C2A8)
        if (y >= 146 && x >= 38 && x <= 202) {
          r = 104;
          g = 194;
          b = 168;
        }

        // Neck (#EBBE9E)
        if (y >= 116 && y < 152 && x >= 104 && x <= 136) {
          r = 235;
          g = 190;
          b = 158;
        }

        // Dark hair crown (#252022)
        const hairDx = (x - 120) / 46;
        const hairDy = (y - 76) / 54;
        if (hairDx * hairDx + hairDy * hairDy <= 1.0) {
          r = 37;
          g = 32;
          b = 34;
        }

        // Upper-frame face oval (#F1CFB3)
        const faceDx = (x - 120) / 31;
        const faceDy = (y - 84) / 39;
        if (faceDx * faceDx + faceDy * faceDy <= 1.0) {
          r = 241;
          g = 207;
          b = 179;
          // Dark eyes / brows band around y = 74..79
          if (y >= 74 && y <= 79 && ((x >= 101 && x <= 113) || (x >= 127 && x <= 139))) {
            r = 42;
            g = 34;
            b = 32;
          }
        }

        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = 255;
      }
    }

    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
    const crc32 = (buf: Buffer): number => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
      return Buffer.concat([len, typeBuf, data, crcBuf]);
    };
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const halfBodyPng = Buffer.concat([
      sig,
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    await page.goto('/');

    // 1. Verify persistent top-right Profile & Account buttons on EVERY screen + zero "2.5D" text
    for (const tab of ['closet', 'outfits', 'calendar', 'stats']) {
      await page.locator(`[data-nav-tab="${tab}"]`).click();
      const accountBtn = page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`);
      const profileBtn = page.locator('#open-profile-studio-btn');
      await expect(accountBtn).toHaveCount(1);
      await expect(accountBtn).toBeVisible();
      await expect(profileBtn).toHaveCount(1);
      await expect(profileBtn).toBeVisible();

      const screenText = await page.locator('body').innerText();
      expect(screenText.toLowerCase()).not.toContain('2.5d');
    }

    // 2. Verify Light Mode is bright with color-scheme: only light and bright white/alabaster cards
    const lightStatsCardRgb = await page.locator('.hig-stats-skin-card').evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const docCs = window.getComputedStyle(document.documentElement);
      return { bg: cs.backgroundColor, colorScheme: docCs.colorScheme };
    });
    expect(lightStatsCardRgb.colorScheme).toContain('light');
    expect(lightStatsCardRgb.bg).toBe('rgb(255, 255, 255)');

    const hangulRegex = /[\uAC00-\uD7A3\u3131-\u318E]/;
    const assertZeroHangulOnPage = async (contextLabel: string) => {
      const violations = await page.evaluate(() => {
        const re = /[\uAC00-\uD7A3\u3131-\u318E]/;
        const found: string[] = [];
        const bodyText = document.body?.innerText || '';
        if (re.test(bodyText)) {
          const matchingLine =
            bodyText.split('\n').find((line) => re.test(line)) || bodyText.slice(0, 80);
          found.push(`text:${matchingLine.trim()}`);
        }
        const els = document.querySelectorAll('*');
        for (const el of Array.from(els)) {
          for (const attr of ['aria-label', 'placeholder', 'alt', 'title']) {
            const val = el.getAttribute(attr);
            if (val && re.test(val)) {
              found.push(`${el.tagName.toLowerCase()}[${attr}="${val}"]`);
            }
          }
          if (
            (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
            el.type !== 'file' &&
            re.test(el.value || '')
          ) {
            found.push(`${el.tagName.toLowerCase()}#${el.id}[value="${el.value}"]`);
          }
          if (el instanceof HTMLOptionElement && re.test(el.textContent || '')) {
            found.push(`option("${(el.textContent || '').trim()}")`);
          }
        }
        return found.slice(0, 10);
      });
      expect(violations, `Hangul leak in ${contextLabel}`).toEqual([]);
    };

    // 3. Switch language to English via top-right Account Settings and verify full UI translation
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await page.locator('[data-lang-btn="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.ui-sheet-box')).toContainText('Account Settings');
    await expect(page.locator('.ui-sheet-box')).toContainText('Photo, Skin Tone & Body Profile');
    expect(await page.locator('.ui-sheet-box').innerText()).not.toMatch(hangulRegex);

    // Open unified Profile Modal directly from Account Settings shortcut
    await page.locator('#settings-open-profile-btn').click();
    await expect(page.locator('#profile-tab-skin')).toHaveText('Photo & Skin');
    await expect(page.locator('#profile-tab-body')).toHaveText('Body Profile');
    expect(await page.locator('.ui-sheet-box').innerText()).not.toMatch(hangulRegex);

    // Check Body Profile tab in English too
    await page.locator('#profile-tab-body').click();
    expect(await page.locator('.ui-sheet-box').innerText()).not.toMatch(hangulRegex);
    await page.locator('#profile-tab-skin').click();

    // 4. Upload half-body portrait wearing mint-green top -> verify face detection & warm skin extraction (NOT gray #A3999B)
    await page.locator('#skin-portrait-file-input').setInputFiles({
      name: 'half-body-mint-top.png',
      mimeType: 'image/png',
      buffer: halfBodyPng,
    });

    await expect(page.locator('.skin-face-detected-badge')).toHaveText('Face Detected');
    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);
    expect(await page.locator('.ui-sheet-box').innerText()).not.toMatch(hangulRegex);

    await page.locator('[data-skin-metrics-toggle="true"]').click();
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toBeVisible();
    expect(await page.locator('.ui-sheet-box').innerText()).not.toMatch(hangulRegex);

    const extractedText = await page
      .locator('[data-skin-metrics-popover="true"] strong')
      .innerText();
    expect(extractedText).toMatch(/^#[0-9A-F]{6}$/);
    const hex = extractedText.trim();
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThanOrEqual(210);
    expect(r - g).toBeGreaterThanOrEqual(15);
    expect(r - b).toBeGreaterThanOrEqual(30);

    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();

    // 5. Verify zero Hangul across all 4 tabs + ItemDetailSheet in Sample Demo Mode
    for (const tab of ['closet', 'outfits', 'calendar', 'stats']) {
      await page.locator(`[data-nav-tab="${tab}"]`).click();
      if (tab === 'closet') {
        await expect(page.locator('.hig-wardrobe-card').first()).toBeVisible();
      }
      if (tab === 'outfits') {
        await page.locator('[data-atelier-weather-capsule="true"]').click();
        const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
        await expect(weatherPanel).toBeVisible();
        await expect(weatherPanel).toContainText('Today Weather');
        await assertZeroHangulOnPage('sample-outfits-weather-popup');
        await page.keyboard.press('Escape');
        await expect(weatherPanel).toHaveCount(0);
      }
      await assertZeroHangulOnPage(`sample-${tab}`);
    }

    // Also sign into seeded SQLite account (`admin` / `admin`) in English mode and verify all Korean DB garments, brands & saved outfits render 100% in English!
    await page.goto('/?auth=1');
    await page.locator(`#${CARBON_DOM_CONTRACT.introGetStartedBtnId}`).click();
    await expect(page.locator('#login-username')).toBeVisible();
    await assertZeroHangulOnPage('login-en');
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin');
    await page.locator('#login-submit-btn').click();

    await expect(page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`)).toBeVisible();
    await assertZeroHangulOnPage('admin-outfits-landing-en');

    await page.locator('[data-nav-tab="closet"]').click();
    await expect(page.locator('.hig-wardrobe-card').first()).toBeVisible();
    await assertZeroHangulOnPage('admin-closet-en');

    // Open a seeded garment ItemDetailSheet and verify localized name/brand/memo inputs have zero Hangul
    await page.locator('.hig-wardrobe-card').first().click();
    await expect(page.locator('#detail-name-input')).toBeVisible();
    await assertZeroHangulOnPage('admin-item-detail-en');
    await page.keyboard.press('Escape');

    // Navigate through Outfits (slot inventory + saved outfit chips), Calendar, and Stats on seeded SQLite data
    for (const tab of ['outfits', 'calendar', 'stats']) {
      await page.locator(`[data-nav-tab="${tab}"]`).click();
      if (tab === 'outfits') {
        await expect(page.locator('[data-atelier-weather-capsule="true"]')).toBeVisible();
        await expect(page.locator('[data-weather-look-dock="true"]')).toBeVisible();
        const mobileSlotBtn = page.locator('.studio-mobile-slot-pill').first();
        if (await mobileSlotBtn.isVisible()) {
          await mobileSlotBtn.click();
          await expect(page.locator('.ui-sheet-box .studio-mini-garment-card').first()).toBeVisible();
          await assertZeroHangulOnPage('admin-outfits-mobile-sheet-en');
          await page.keyboard.press('Escape');
        } else {
          await expect(page.locator('.studio-mini-garment-card').first()).toBeVisible();
        }
      }
      await assertZeroHangulOnPage(`admin-${tab}-en`);
    }

    // Switch back to Korean via top-right Account Settings and confirm Korean strings return cleanly
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await assertZeroHangulOnPage('admin-account-settings-en');
    await page.locator('[data-lang-btn="ko"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.keyboard.press('Escape');
    await page.locator('[data-nav-tab="closet"]').click();
    await expect(page.locator('.hig-wardrobe-card').first()).toBeVisible();
    expect(await page.locator('body').innerText()).toMatch(hangulRegex);
  });

  test('7. Neural Face Landmark Detection: full-body zoom, 45° portrait, tap-focus retention, MST-10 deep skin, and zero WASM on sample presets', async ({
    page,
  }) => {
    const neuralRequests: string[] = [];
    let trackSampleOnly = true;
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (trackSampleOnly && (url.endsWith('.wasm') || url.endsWith('.task'))) {
        neuralRequests.push(url);
      }
    });

    await page.goto('/outfits');
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(page.locator('#profile-tab-skin')).toBeVisible();
    await expect(page.locator('[data-lighting-mode]')).toHaveCount(0);

    // 1. Sample portrait must strictly use pure_ts_integral with ZERO .wasm/.task loads
    await page.locator('[data-sample-toggle="true"]').click();
    await page.locator('[data-sample-portrait="autumn_warm"]').click();
    const pinFrame = page.locator('.skin-portrait-pin-frame');
    await expect(pinFrame).toHaveAttribute('data-detector-engine', 'pure_ts_integral');
    await expect(page.locator('.skin-face-detected-badge')).toHaveText('얼굴 인식됨');
    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);
    await expect(page.locator('[data-lighting-mode]')).toHaveCount(4);
    expect(neuralRequests).toEqual([]);

    trackSampleOnly = false;

    // Extract realistic full-body front quadrant & 45° bust crop from bundled showcase image
    const crops = await page.evaluate(async () => {
      const img = new Image();
      img.src = '/seed/vton-showcase-photoreal.jpg';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Failed to load showcase portrait'));
      });
      const extract = (sx: number, sy: number, sw: number, sh: number, outW: number, outH: number) => {
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        return c.toDataURL('image/jpeg', 0.92).replace(/^data:image\/jpeg;base64,/, '');
      };
      return {
        fullBodyFrontB64: extract(0, 0, 512, 512, 512, 512),
        quarter45BustB64: extract(610, 0, 320, 260, 320, 260),
      };
    });

    // 2. Upload full-body portrait -> progressive Stage 2 MediaPipe detects head cleanly
    await page.locator('#skin-portrait-file-input').setInputFiles({
      name: 'fullbody-front.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(crops.fullBodyFrontB64, 'base64'),
    });

    await expect(pinFrame).toHaveAttribute('data-detector-engine', 'mediapipe_face_landmarker', {
      timeout: 20000,
    });
    await expect(page.locator('.skin-face-detected-badge')).toHaveText('얼굴 인식됨');
    await expect(page.locator('[data-user-face-active="true"]')).toBeVisible();
    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);

    // Metrics hidden by default; open ? popover to read extracted hex & L*
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toHaveCount(0);
    await page.locator('[data-skin-metrics-toggle="true"]').click();
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toBeVisible();

    const fullBodyMetrics = await page.evaluate(() => {
      const box = document.querySelector('.skin-face-box-guide') as HTMLElement | null;
      const pin = (id: string) =>
        document.querySelector(`.skin-sample-pin[data-skin-pin-id="${id}"]`) as HTMLElement | null;
      const popover = document.querySelector('[data-skin-metrics-popover="true"]');
      const hex = popover?.querySelector('strong')?.textContent?.trim() || '';
      const labText = popover?.textContent || '';
      const lMatch = labText.match(/L\*\s*([\d.]+)/);
      return {
        boxH: Number.parseFloat(box?.style.height || '0'),
        boxW: Number.parseFloat(box?.style.width || '0'),
        foreheadTop: Number.parseFloat(pin('forehead')?.style.top || '0'),
        cheekTop: Number.parseFloat(pin('leftCheek')?.style.top || '0'),
        chinTop: Number.parseFloat(pin('chin')?.style.top || '0'),
        hex,
        L: lMatch ? Number.parseFloat(lMatch[1]) : 0,
      };
    });

    await page.locator('[data-skin-metrics-toggle="true"]').click();
    await expect(page.locator('[data-skin-metrics-popover="true"]')).toHaveCount(0);

    expect(fullBodyMetrics.boxH).toBeGreaterThanOrEqual(35);
    expect(fullBodyMetrics.boxW).toBeGreaterThanOrEqual(28);
    expect(fullBodyMetrics.foreheadTop).toBeLessThan(fullBodyMetrics.cheekTop);
    expect(fullBodyMetrics.cheekTop).toBeLessThan(fullBodyMetrics.chinTop);
    expect(fullBodyMetrics.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(fullBodyMetrics.L).toBeGreaterThanOrEqual(55);
    expect(fullBodyMetrics.L).toBeLessThanOrEqual(88);

    // 3. Upload 45° rotated bust portrait & verify tap-focus preserves landmarks
    const prevPreviewSrc = await page.locator('.skin-portrait-pin-img').getAttribute('src');
    await page.locator('#skin-portrait-file-input').setInputFiles({
      name: 'quarter45-portrait.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(crops.quarter45BustB64, 'base64'),
    });

    await expect
      .poll(async () => await page.locator('.skin-portrait-pin-img').getAttribute('src'))
      .not.toBe(prevPreviewSrc);
    await expect(pinFrame).toHaveAttribute('data-detector-engine', 'mediapipe_face_landmarker');
    await expect(page.locator('.skin-analyzing-tag')).toHaveCount(0);

    // Tap inside face center -> keeps mediapipe_face_landmarker & full-face box size
    const pinFrameBox = await pinFrame.boundingBox();
    expect(pinFrameBox).not.toBeNull();
    if (pinFrameBox) {
      await pinFrame.click({
        position: {
          x: Math.round(pinFrameBox.width * 0.5),
          y: Math.round(pinFrameBox.height * 0.5),
        },
      });
    }
    await expect(page.locator('.skin-analyzing-tag')).toHaveCount(0);
    await expect(pinFrame).toHaveAttribute('data-detector-engine', 'mediapipe_face_landmarker');
    const afterTapBoxH = await page
      .locator('.skin-face-box-guide')
      .evaluate((el) => Number.parseFloat((el as HTMLElement).style.height || '0'));
    expect(afterTapBoxH).toBeGreaterThanOrEqual(35);

    // 4. Deep MST-10 skin tone portrait (#291711) -> detects face & preserves deep luminance
    const w = 240;
    const h = 300;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y += 1) {
      const ro = y * (w * 4 + 1);
      raw[ro] = 0;
      for (let x = 0; x < w; x += 1) {
        const px = ro + 1 + x * 4;
        let r = 238;
        let g = 240;
        let b = 244;
        if (y >= 200 && x >= 45 && x <= 195) {
          r = 70;
          g = 85;
          b = 110;
        }
        if (y >= 158 && y < 208 && x >= 100 && x <= 140) {
          r = 41;
          g = 23;
          b = 17;
        }
        const hdx = (x - 120) / 56;
        const hdy = (y - 98) / 68;
        if (hdx * hdx + hdy * hdy <= 1) {
          r = 18;
          g = 15;
          b = 16;
        }
        const fdx = (x - 120) / 44;
        const fdy = (y - 112) / 56;
        if (fdx * fdx + fdy * fdy <= 1) {
          r = 41;
          g = 23;
          b = 17;
          if (Math.hypot(x - 96, y - 122) < 13 || Math.hypot(x - 144, y - 122) < 13) {
            r = 52;
            g = 29;
            b = 21;
          }
          if (y >= 96 && y <= 104 && ((x >= 92 && x <= 108) || (x >= 132 && x <= 148))) {
            r = 18;
            g = 15;
            b = 16;
          }
          if (y >= 108 && y <= 128 && x >= 117 && x <= 123) {
            r = 31;
            g = 15;
            b = 10;
          }
          if (y >= 140 && y <= 146 && x >= 108 && x <= 132) {
            r = 23;
            g = 9;
            b = 6;
          }
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
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    const crc32 = (buf: Buffer): number => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const makeChunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const tb = Buffer.from(type, 'ascii');
      const cb = Buffer.alloc(4);
      cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
      return Buffer.concat([len, tb, data, cb]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const deepPortraitPng = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', zlib.deflateSync(raw)),
      makeChunk('IEND', Buffer.alloc(0)),
    ]);

    const prevPreviewBeforeDeep = await page.locator('.skin-portrait-pin-img').getAttribute('src');
    await page.locator('#skin-portrait-file-input').setInputFiles({
      name: 'deep-mst10-portrait.png',
      mimeType: 'image/png',
      buffer: deepPortraitPng,
    });
    await expect
      .poll(async () => await page.locator('.skin-portrait-pin-img').getAttribute('src'))
      .not.toBe(prevPreviewBeforeDeep);
    await expect(page.locator('.skin-analyzing-tag')).toHaveCount(0);
    await expect(page.locator('.skin-face-detected-badge')).toHaveText('얼굴 인식됨');

    const unifiedToneBadge = page.locator('[data-unified-tone-badge="true"]');
    await expect(unifiedToneBadge).toHaveAttribute('data-mst-code', /^MST-(09|10)-/);
    const badgeText = await unifiedToneBadge.innerText();
    expect(badgeText).toMatch(/딥/);
    expect(badgeText).not.toMatch(/MST-\d+/);
  });

  test('9. After-8PM Tomorrow Outfit prompt modal (max 3 impressions, 예 -> tomorrow / 아니오 -> today) and Galaxy live time-of-day sky stages', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __AINVENTORY_HOUR_OVERRIDE__?: number }).__AINVENTORY_HOUR_OVERRIDE__ = 21;
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      window.localStorage.setItem('ainventory_outfit_generated_date_v1', `${y}-${m}-${d}`);
    });

    // Impression 1: Dismiss with 아니오 -> keeps today weather
    await page.goto('/?tod=sunset');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toHaveAttribute('data-time-of-day', 'sunset');
    await expect(studioCanvas.locator('[data-atelier-backdrop="true"]')).toHaveAttribute(
      'data-backdrop-tod',
      'sunset'
    );
    const tomorrowModal = page.locator('[data-tomorrow-outfit-modal="true"]');
    await expect(tomorrowModal).toBeVisible();
    const modalLayerAudit = await page.evaluate(() => {
      const sheet = document.querySelector('#tomorrow-outfit-prompt-modal');
      const backdrop = sheet?.closest('.ui-sheet-backdrop');
      const tabbar = document.querySelector('.hig-floating-tabbar');
      const yesBtn = sheet?.querySelector('[data-tomorrow-prompt-yes="true"]');
      const noBtn = sheet?.querySelector('[data-tomorrow-prompt-no="true"]');
      const bZ = backdrop ? Number(window.getComputedStyle(backdrop).zIndex || 0) : 0;
      const tZ = tabbar ? Number(window.getComputedStyle(tabbar).zIndex || 0) : 0;
      const noRect = noBtn?.getBoundingClientRect();
      const topHit = noRect
        ? document.elementFromPoint(noRect.left + noRect.width / 2, noRect.top + noRect.height / 2)
        : null;
      return {
        bZ,
        tZ,
        yesInteractive: Boolean(yesBtn),
        noDirectHit: Boolean(noBtn && topHit && (topHit === noBtn || noBtn.contains(topHit))),
      };
    });
    expect(modalLayerAudit.bZ).toBeGreaterThan(modalLayerAudit.tZ);
    expect(modalLayerAudit.yesInteractive).toBe(true);
    expect(modalLayerAudit.noDirectHit).toBe(true);

    await tomorrowModal.locator('[data-tomorrow-prompt-no="true"]').click();
    await expect(tomorrowModal).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-day-target', 'today');

    // Impression 2: Confirm with 예 -> switches weather to tomorrow
    await page.goto('/?tod=night');
    await expect(studioCanvas).toHaveAttribute('data-time-of-day', 'night');
    await expect(studioCanvas.locator('[data-weather-foreground]')).toHaveAttribute(
      'data-weather-tod',
      'night'
    );
    await expect(tomorrowModal).toBeVisible();
    await tomorrowModal.locator('[data-tomorrow-prompt-yes="true"]').click();
    await expect(tomorrowModal).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-day-target', 'tomorrow');
    await expect(studioCanvas.locator('[data-weather-capsule-datetime="true"]')).toContainText('내일');

    // Impression 3: Shown one final time, dismiss
    await page.goto('/?tod=day');
    await expect(studioCanvas).toHaveAttribute('data-time-of-day', 'day');
    await expect(tomorrowModal).toBeVisible();
    await tomorrowModal.locator('[data-tomorrow-prompt-no="true"]').click();
    await expect(tomorrowModal).toHaveCount(0);

    // 4th access: Must NOT appear (>= 3 impressions reached)
    await page.reload();
    await expect(studioCanvas).toBeVisible();
    await expect(tomorrowModal).toHaveCount(0);
  });

  test('10. Nav bar 50% default opacity + Settings slider, 10 architectural stage backgrounds, Store free-draw speech bubble & gacha, and Calendar attendance (+10 i)', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // 1) Default C-tier architectural backdrop & translucent bottom navigation bar (`0.5` = 50%)
    await expect(studioCanvas).toHaveAttribute('data-stage-bg-id', 'c_atelier_plaster');
    await expect(studioCanvas).toHaveAttribute('data-stage-bg-tier', 'C');
    await expect(studioCanvas.locator('.atelier-stage-environment-photo')).toBeVisible();

    const defaultNavOpacity = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue('--hig-nav-bg-opacity').trim()
    );
    expect(Number.parseFloat(defaultNavOpacity)).toBeCloseTo(0.5, 2);

    // Settings slider adjusts --hig-nav-bg-opacity live & Default 50% button resets it
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    const opacitySlider = page.locator('[data-nav-opacity-slider="true"]');
    await expect(opacitySlider).toBeVisible();
    await opacitySlider.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(input, '0.85');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('[data-nav-opacity-value="true"]')).toHaveText('85%');
    const updatedNavOpacity = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue('--hig-nav-bg-opacity').trim()
    );
    expect(Number.parseFloat(updatedNavOpacity)).toBeCloseTo(0.85, 2);

    await page.locator('[data-nav-opacity-reset="true"]').click();
    await expect(page.locator('[data-nav-opacity-value="true"]')).toHaveText('50%');
    await page.keyboard.press('Escape');

    // 2) Top-right Store button + Unclaimed daily free-draw speech bubble -> opens #stage-store-modal & claims free 0 i draw
    const storeBtn = page.locator('[data-open-store-btn="true"]');
    const freeBubble = page.locator('[data-store-free-draw-bubble="true"]');
    await expect(storeBtn).toBeVisible();
    await expect(freeBubble).toBeVisible();
    await expect(freeBubble).toContainText(/무료 뽑기|Free daily draw/);

    await freeBubble.click();
    const storeModal = page.locator('#stage-store-modal');
    await expect(storeModal).toBeVisible();
    await expect(storeModal.locator('[data-store-balance="true"]')).toHaveText('0 i');
    await expect(storeModal.locator('[data-store-collection-item]')).toHaveCount(10);

    const drawBtn = storeModal.locator('[data-store-draw-btn="true"]');
    await expect(drawBtn).toContainText(/무료 뽑기|Free Daily Draw/);
    await drawBtn.click();
    await expect(storeModal.locator('[data-store-phase="spinning"]')).toBeVisible();
    await expect(storeModal.locator('[data-store-roulette-needle="true"]')).toBeVisible();
    await expect(storeModal.locator('[data-store-draw-result="true"]')).toBeVisible({
      timeout: 6000,
    });
    await expect(storeModal.locator('[data-store-reveal-tier]')).toHaveAttribute(
      'data-store-reveal-tier',
      /^[SABC]$/
    );
    await page.keyboard.press('Escape');
    await expect(storeModal).toHaveCount(0);
    await expect(freeBubble).toHaveCount(0);

    // 3) Top-left Background Picker opens all 10 (S×1, A×2, B×3, C×4) & equips C-tier / unlocked background
    await studioCanvas.locator('[data-stage-bg-picker-btn="true"]').click();
    const bgPickerModal = page.locator('#stage-background-picker-modal');
    await expect(bgPickerModal).toBeVisible();
    await expect(bgPickerModal.locator('[data-bg-tier-group="S"] [data-bg-option-id]')).toHaveCount(1);
    await expect(bgPickerModal.locator('[data-bg-tier-group="A"] [data-bg-option-id]')).toHaveCount(2);
    await expect(bgPickerModal.locator('[data-bg-tier-group="B"] [data-bg-option-id]')).toHaveCount(3);
    await expect(bgPickerModal.locator('[data-bg-tier-group="C"] [data-bg-option-id]')).toHaveCount(4);

    // Equip an unlocked option and confirm modal closes & stage attribute stays valid
    await bgPickerModal.locator('[data-bg-option-id="c_atelier_plaster"]').click();
    await expect(bgPickerModal).toHaveCount(0);
    await expect(studioCanvas).toHaveAttribute('data-stage-bg-id', 'c_atelier_plaster');

    // 4) Calendar tab -> Attendance check-in awards +10 i, increments streak, and stamps today
    await page.locator('[data-nav-tab="calendar"]').click();
    await expect(page.locator('[data-calendar-attendance-card="true"]')).toBeVisible();
    await expect(page.locator('[data-calendar-i-balance="true"]')).toHaveText('0 i');
    const attendanceBtn = page.locator('[data-calendar-attendance-btn="true"]');
    await expect(attendanceBtn).toBeEnabled();
    await attendanceBtn.click();

    await expect(page.locator('[data-calendar-i-balance="true"]')).toHaveText('10 i');
    await expect(page.locator('[data-calendar-streak="true"]')).toContainText(/1일|1d/);
    await expect(attendanceBtn).toBeDisabled();
    await expect(page.locator('[data-calendar-attended="true"]').first()).toBeVisible();

    // 5) Return to Outfits -> paid 10 i backdrop gacha draw works, spins roulette, supports Skip, & spends 10 i
    await page.locator('[data-nav-tab="outfits"]').click();
    await page.locator('[data-open-store-btn="true"]').click();
    await expect(storeModal).toBeVisible();
    await expect(storeModal.locator('[data-store-balance="true"]')).toHaveText('10 i');
    await expect(storeModal.locator('[data-store-draw-btn="true"]')).toBeEnabled();
    await expect(storeModal.locator('[data-store-draw-btn="true"]')).toContainText('10 i');
    await storeModal.locator('[data-store-draw-btn="true"]').click();
    await expect(storeModal.locator('[data-store-phase="spinning"]')).toBeVisible();
    const skipSpinBtn = storeModal.locator('[data-store-skip-spin="true"]');
    if (await skipSpinBtn.isVisible()) {
      await skipSpinBtn.click();
    }
    await expect(storeModal.locator('[data-store-draw-result="true"]')).toBeVisible();
    await expect(storeModal.locator('[data-store-balance="true"]')).toHaveText(/^(0|5) i$/);
  });
});

