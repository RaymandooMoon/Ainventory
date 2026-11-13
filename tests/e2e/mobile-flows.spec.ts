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
  test('1. Default Closet home, Apple HIG minimalism, squircle 2.5D grid, and zero 3D/MediaPipe loads', async ({
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

    // 1. Default Home is MY WARDROBE (`Closet`)
    const titleEl = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeHeaderTitleId}`);
    await expect(titleEl).toHaveText('MY WARDROBE');

    const countEl = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeItemCountId}`);
    await expect(countEl).toHaveText(/^\d+ ITEMS$/);

    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}`)).toBeVisible();

    // 2. Exact 6 Pill Category Filters
    const pills = page.locator(`#${CARBON_DOM_CONTRACT.wardrobeCategoryRailId} button`);
    await expect(pills).toHaveText([
      'All',
      'Tops',
      'Bottoms',
      'Outerwear',
      'Shoes',
      'Accessories',
    ]);

    // 3. Unified Bottom-Center Floating Glassmorphism 4-Tab Bar
    const tabs = page.locator(`#${CARBON_DOM_CONTRACT.floatingTabBarId} button`);
    await expect(tabs).toHaveText(['Closet', 'Outfits', 'Calendar', 'Stats']);

    // 4. Squircle #F5F5F7 cards with zero SVG placeholder wireframes
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

    // 5. Zero prohibited editorial copy & zero 3D/WASM requests
    const bodyText = await page.locator('body').innerText();
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
    await page.goto('/');

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
    await expect(page.locator('#wardrobe-header-title')).toHaveText('MY WARDROBE');

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
    await expect(motionStage.locator('#wardrobe-optical-scanner')).toBeVisible();
    await expect(motionStage.locator('[data-inventory-slot="0"]')).toBeVisible();

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

    // 1. Tomorrow Weather Recommendation Panel & 2.5D Character Mannequin are visible
    const weatherPanel = page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`);
    await expect(weatherPanel).toBeVisible();
    await expect(weatherPanel).toContainText('내일 날씨 코디');
    await expect(weatherPanel.locator('[data-weather-rec-id]').first()).toBeVisible();

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const mannequin = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(mannequin).toBeVisible();
    await expect(mannequin.locator('.character-25d-fallback-svg')).toHaveCount(0);
    await expect(
      mannequin.locator('canvas.character-25d-render-canvas[data-body-ready="true"]')
    ).toBeVisible();

    // Wait for Tomorrow's Weather #1 recommendation to dress the 2.5D character
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();

    // 2. Switch weather scenario: Rainy Cool (needs outer + rain stage cue) -> Warm Spring (no outer)
    await weatherPanel.locator('[data-weather-scenario="rainy_cool"]').click();
    await expect(studioCanvas.locator('.studio-25d-rain-layer')).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();

    await weatherPanel.locator('[data-weather-scenario="warm_spring"]').click();
    await expect(studioCanvas.locator('.studio-25d-rain-layer')).toHaveCount(0);
    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toHaveCount(0);

    // 3. Quick 1-Tap Skin-Tone Swatch on 2.5D Studio Canvas changes mannequin tone immediately
    await studioCanvas.locator('[data-quick-skin-preset="deep_espresso"]').click();
    await expect(mannequin).toHaveAttribute('data-skin-hex', '#8E5C40');

    // 4. Portrait Skin-Tone Analyzer Modal -> 4-pin L*a*b* extraction -> Apply (gender locked, zero 2.5D text)
    await page.locator(`#${CARBON_DOM_CONTRACT.openSkinToneModalBtnId}`).click();
    await expect(page.locator('#profile-tab-skin')).toBeVisible();
    await expect(page.locator('#profile-tab-body')).toBeVisible();
    await expect(page.locator('.skin-gender-pill')).toHaveCount(0);

    await page.locator('[data-sample-portrait="spring_warm"]').click();

    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);
    await expect(page.locator('.skin-lab-metrics')).toContainText('ITA°');

    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();

    await expect(mannequin).toHaveAttribute('data-personal-color', 'spring_warm');
    const updatedHex = await mannequin.getAttribute('data-skin-hex');
    expect(updatedHex).not.toBe('#8E5C40');

    // 5. 360° Game-Character Multi-Angle Inspection (`앞`, `뒤`, `좌`, `우`, `상`, `하`) & Body Shape Morph
    for (const preset of ['back', 'left', 'right', 'top', 'bottom', 'front']) {
      await studioCanvas.locator(`[data-camera-preset-btn="${preset}"]`).click();
      await expect(mannequin).toHaveAttribute('data-camera-preset', preset);
    }

    await studioCanvas.locator('#open-body-spec-btn').click();
    await expect(page.locator('[data-body-gender-btn]')).toHaveCount(0);
    await page.locator('[data-body-shape-btn="muscular"]').click();
    await page.locator('#apply-body-spec-btn').click();
    await expect(mannequin).toHaveAttribute('data-body-shape', 'muscular');

    // Unequipping Tops leaves an unbroken parametric 3D character (no waist chop)
    await studioCanvas.locator('[data-studio-slot="top"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toHaveCount(0);
    await expect(mannequin).toBeVisible();

    // 6. Unmount -> Remount lifecycle regression guard (prevents WebGL context-loss fallback SVG)
    const tabBar = page.locator(`#${CARBON_DOM_CONTRACT.floatingTabBarId}`);
    await tabBar.getByRole('button', { name: 'Closet' }).click();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeHeaderTitleId}`)).toBeVisible();
    await tabBar.getByRole('button', { name: 'Outfits' }).click();
    await expect(mannequin.locator('.character-25d-fallback-svg')).toHaveCount(0);
    await expect(
      mannequin.locator('canvas.character-25d-render-canvas[data-body-ready="true"]')
    ).toBeVisible();

    expect(forbiddenAssetRequests).toEqual([]);
  });

  test('5. Signup gender & anthropometric info automatically configure the 3D character model', async ({
    page,
  }) => {
    await page.goto('/?auth=1');

    await page.locator(`#${CARBON_DOM_CONTRACT.authTabRegisterId}`).click();
    const uniqueEmail = `female.avatar.${Date.now()}@example.com`;
    await page.locator('#register-email-input').fill(uniqueEmail);
    await page.locator('#send-otp-btn').click();

    // Local dev mode auto-fills OTP code; click Verify
    await expect(page.locator('#verify-otp-btn')).toBeVisible();
    await page.locator('#verify-otp-btn').click();
    await expect(page.locator('#verify-otp-btn')).toContainText('인증됨');

    // Select Female (`여성`) + 165cm + 53kg at signup
    await page.locator('[data-signup-gender="female"]').click();
    await page.locator('#register-name-input').fill('서연');
    await page.locator('#register-height-input').fill('165');
    await page.locator('#register-weight-input').fill('53');
    await page.locator('#register-password-input').fill('pass1234');
    await page.locator('#complete-register-btn').click();

    // Lands on MY WARDROBE -> navigate to Outfits and verify Female + 165cm + 53kg reflected automatically
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.wardrobeHeaderTitleId}`)).toHaveText(
      'MY WARDROBE'
    );
    await page.locator('[data-nav-tab="outfits"]').click();

    const mannequin = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(mannequin).toBeVisible();
    await expect(mannequin).toHaveAttribute('data-character-gender', 'female');
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

    // 3. Switch language to English via top-right Account Settings and verify full UI translation
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await page.locator('[data-lang-btn="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.ui-sheet-box')).toContainText('Account Settings');
    await expect(page.locator('.ui-sheet-box')).toContainText('Photo, Skin Tone & Body Profile');

    // Open unified Profile Modal directly from Account Settings shortcut
    await page.locator('#settings-open-profile-btn').click();
    await expect(page.locator('#profile-tab-skin')).toHaveText('Photo & Skin');
    await expect(page.locator('#profile-tab-body')).toHaveText('Body Profile');

    // 4. Upload half-body portrait wearing mint-green top -> verify face detection & warm skin extraction (NOT gray #A3999B)
    await page.locator('#skin-portrait-file-input').setInputFiles({
      name: 'half-body-mint-top.png',
      mimeType: 'image/png',
      buffer: halfBodyPng,
    });

    await expect(page.locator('.skin-face-detected-badge')).toHaveText('Face Detected');
    await expect(page.locator('.skin-sample-pin')).toHaveCount(4);

    const extractedText = await page.locator('.skin-lab-metrics strong').innerText();
    expect(extractedText).toMatch(/^#[0-9A-F]{6}$/);
    const hex = extractedText.trim();
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThanOrEqual(210);
    expect(r - g).toBeGreaterThanOrEqual(15);
    expect(r - b).toBeGreaterThanOrEqual(30);

    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();

    // Navigate to Outfits and verify English translation on weather bar & camera HUD
    await page.locator('[data-nav-tab="outfits"]').click();
    await expect(page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId}`)).toContainText(
      'Tomorrow Weather'
    );

    // Switch back to Korean via top-right Account Settings on Outfits
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await page.locator('[data-lang-btn="ko"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });
});


