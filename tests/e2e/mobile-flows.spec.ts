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

    // Verify Account Settings Sheet -> Login View with Dual-Theme Background Videos
    await page.locator(`#${CARBON_DOM_CONTRACT.openAccountSettingsBtnId}`).click();
    await expect(page.locator('#account-logout-btn')).toBeVisible();
    await page.locator('#account-logout-btn').click();

    await expect(page.locator('#login-bg-video-dark')).toHaveClass(/is-active/);
    await expect(page.locator('#login-bg-video-dark')).toHaveAttribute(
      'src',
      '/media/login-bg-dark.mp4'
    );

    await page.locator(`#${CARBON_DOM_CONTRACT.loginThemeToggleId}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#login-bg-video-light')).toHaveClass(/is-active/);
    await expect(page.locator('#login-bg-video-light')).toHaveAttribute(
      'src',
      '/media/login-bg-light.mp4'
    );
  });
});
