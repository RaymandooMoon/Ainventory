import { expect, type Page, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

async function selectStudioSlotAndPickItem(
  page: Page,
  slotKey: 'outer' | 'top' | 'bottom' | 'onepiece' | 'shoes' | 'accessory',
  options?: { season?: 'all' | '봄' | '여름' | '가을' | '겨울'; matchText?: RegExp }
): Promise<string> {
  const mobileSlotBtn = page.locator(`[data-mobile-slot-btn="${slotKey}"]`);
  if (await mobileSlotBtn.isVisible()) {
    await mobileSlotBtn.click();
    const sheet = page.locator('.ui-sheet-box');
    await expect(sheet).toBeVisible();
    if (options?.season) {
      await sheet.locator(`[data-outfit-season-filter="${options.season}"]`).click();
    }
    const cards = sheet.locator('[data-slot-garment-id]');
    const target = options?.matchText ? cards.filter({ hasText: options.matchText }).first() : cards.first();
    await expect(target).toBeVisible();
    const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
    await target.click();
    return pickedId;
  }

  await page.locator(`[data-outfit-slot-tab="${slotKey}"]`).click();
  const picker = page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`);
  if (options?.season) {
    await picker.locator(`[data-outfit-season-filter="${options.season}"]`).click();
  }
  const cards = picker.locator('[data-slot-garment-id]');
  const target = options?.matchText ? cards.filter({ hasText: options.matchText }).first() : cards.first();
  await expect(target).toBeVisible();
  const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
  await target.click();
  return pickedId;
}

function setRangeSliderValue(page: Page, sliderSelector: string, nextValue: number) {
  return page.locator(sliderSelector).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, nextValue);
}

test.describe('Inclusive Parametric Avatar, Isometric 8-Angle VTON & 4-Season 128-Item Dataset', () => {
  test('1. Default +45° isometric quarter-view, 8-direction rotation HUD, pointer drag-to-rotate, and reset', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(modelStage).toBeVisible();

    // Default camera view is +45° isometric quarter-view
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    await expect(modelStage).toHaveAttribute('data-view-angle', '45');

    const cwBtn = studioCanvas.locator('[data-iso-rotate-btn="cw"]');
    const ccwBtn = studioCanvas.locator('[data-iso-rotate-btn="ccw"]');
    await expect(cwBtn).toBeVisible();
    await expect(ccwBtn).toBeVisible();

    // Step through all 8 directions cleanly (45 -> 0 -> -45 -> -90 -> -135 -> 180 -> 135 -> 90 -> 45)
    const expectedSequence = ['0', '-45', '-90', '-135', '180', '135', '90', '45'];
    for (const expectedDeg of expectedSequence) {
      await cwBtn.click();
      await expect(studioCanvas).toHaveAttribute('data-view-angle', expectedDeg);
      await expect(modelStage).toHaveAttribute('data-view-angle', expectedDeg);
    }

    // Rotate away from 45° via CCW, then click angle badge to snap back to 45° default
    await ccwBtn.click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    await studioCanvas.locator('[data-iso-angle-badge]').click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');

    // Horizontal pointer drag at 1.0x zoom rotates isometric angle
    const box = await modelStage.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const startX = box.x + box.width * 0.52;
      const startY = box.y + box.height * 0.5;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 75, startY, { steps: 6 });
      await page.mouse.up();
      await expect(studioCanvas).not.toHaveAttribute('data-view-angle', '45');
    }
  });

  test('2. Inclusive Avatar Studio: 4 frames, high-BMI coupled morphing (164cm/103kg), MST 1-10 x 4, hair/beard & hash sync', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    const initialHash = await studioCanvas.getAttribute('data-avatar-hash');
    expect(initialHash).toMatch(/^av2_[0-9a-f]{16}$/);

    // Open Profile Avatar Studio -> Body Profile tab
    await page.locator('#open-profile-studio-btn').click();
    await page.locator('#profile-tab-body').click();

    // Verify all 4 gender-inclusive base frames & 8 body archetypes exist
    for (const frame of ['feminine', 'masculine', 'androgynous', 'custom']) {
      await expect(page.locator(`[data-avatar-frame-btn="${frame}"]`)).toBeVisible();
    }
    for (const arch of [
      'hourglass',
      'inverted_triangle',
      'pear',
      'apple',
      'rectangle',
      'athletic',
      'petite',
      'plus_size',
    ]) {
      await expect(page.locator(`[data-archetype-preset="${arch}"]`)).toBeVisible();
    }

    // Select Androgynous frame + Plus Size archetype + High-BMI 164cm / 103kg (BMI 38.3)
    await page.locator('[data-avatar-frame-btn="androgynous"]').click();
    await page.locator('[data-archetype-preset="plus_size"]').click();
    await setRangeSliderValue(page, 'input[data-avatar-slider="heightCm"]', 164);
    await setRangeSliderValue(page, 'input[data-avatar-slider="weightKg"]', 103);
    await page.locator('[data-chest-form-btn="full_bust"]').click();

    await expect(page.locator('[data-bmi-badge]')).toHaveAttribute('data-bmi-badge', '38.3');
    const coupledStripText = await page.locator('.avatar-coupled-metrics-strip').innerText();
    // Cheek, Neck, and Hands & Feet coupled volumes must all exceed 105% at BMI 38.3
    const pctMatches = coupledStripText.match(/(\d+)%/g) || [];
    expect(pctMatches.length).toBe(3);
    for (const m of pctMatches) {
      expect(Number.parseInt(m, 10)).toBeGreaterThan(105);
    }

    // Switch to Photo & Skin tab -> test MST-10 deep tone, Hair (type4_coily_afro) & Beard
    await page.locator('#profile-tab-skin').click();
    await page.locator('[data-mst-level="10"]').click();
    await page.locator('[data-mst-undertone="warm"]').click();
    await expect(page.locator('[data-mst-code-badge]')).toHaveAttribute(
      'data-mst-code-badge',
      'MST-10-WARM'
    );

    await page.locator('[data-hair-style-btn="type4_coily_afro"]').click();
    await page.locator('[data-facial-hair-btn="short_boxed_beard"]').click();

    const modalLiveHash = await page
      .locator('.avatar-config-hash-badge')
      .getAttribute('data-avatar-config-hash');
    expect(modalLiveHash).toMatch(/^av2_[0-9a-f]{16}$/);
    expect(modalLiveHash).not.toBe(initialHash);

    // Apply & verify immediate reactive sync on Outfits stage
    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();
    await expect(studioCanvas).toHaveAttribute('data-avatar-hash', modalLiveHash!);
    await expect(modelStage).toHaveAttribute('data-height-cm', '164');
    await expect(modelStage).toHaveAttribute('data-weight-kg', '103');
  });

  test('3. 6-slot 1:1 binding, zero underwear/socks in Accessories, swimwear + flip-flops try-on, and ghost invalidation', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    // Verify Accessories slot contains ZERO underwear / socks items
    const mobileAccBtn = page.locator('[data-mobile-slot-btn="accessory"]');
    if (await mobileAccBtn.isVisible()) {
      await mobileAccBtn.click();
      const sheetText = await page.locator('.ui-sheet-box').innerText();
      expect(sheetText).not.toMatch(/이너탑|언더웨어|크루 삭스|앵클 삭스|Underwear|Socks/i);
      await page.keyboard.press('Escape');
    } else {
      await page.locator('[data-outfit-slot-tab="accessory"]').click();
      const pickerText = await page
        .locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`)
        .innerText();
      expect(pickerText).not.toMatch(/이너탑|언더웨어|크루 삭스|앵클 삭스|Underwear|Socks/i);
    }

    // Clear outfit, then equip Summer swimwear (`onepiece`) + Summer flip-flops (`shoes`) + sunglasses (`accessory`)
    const resetBtn = page.getByRole('button', { name: /착장 초기화|Reset Outfit/i });
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
    }
    await expect(studioCanvas).toHaveAttribute('data-equipped-count', '0');

    await selectStudioSlotAndPickItem(page, 'onepiece', {
      season: '여름',
      matchText: /수영복|비키니|래시가드|Swim|Bikini|Rashguard/i,
    });
    await expect(studioCanvas.locator('[data-studio-slot="onepiece"]')).toBeVisible();

    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '여름',
      matchText: /쪼리|플립플랍|샌들|Flip|Sandal/i,
    });
    await expect(studioCanvas.locator('[data-studio-slot="shoes"]')).toBeVisible();

    await selectStudioSlotAndPickItem(page, 'accessory', {
      season: '여름',
      matchText: /선글라스|버킷햇|토트|Sunglasses|Bucket|Tote/i,
    });
    await expect(studioCanvas.locator('[data-studio-slot="accessory"]')).toBeVisible();

    // Wait for VTON synthesis to finish on this 3-item summer beachwear combo
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-loading'), { timeout: 15000 })
      .toBe('false');
    const summerImgSrc = await studioCanvas
      .locator('[data-vton-after-img="true"]')
      .getAttribute('src');
    expect(summerImgSrc).toBeTruthy();

    // Unequip swimwear (`onepiece`) -> verify immediate chip removal & fresh rendered image (no stale ghost!)
    await studioCanvas.locator('[data-studio-slot="onepiece"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="onepiece"]')).toHaveCount(0);
    await expect
      .poll(async () => studioCanvas.getAttribute('data-vton-loading'), { timeout: 15000 })
      .toBe('false');
    const afterUnequipSrc = await studioCanvas
      .locator('[data-vton-after-img="true"]')
      .getAttribute('src');
    expect(afterUnequipSrc).not.toBe(summerImgSrc);
  });

  test('4. 4-Season 128-item photorealistic catalog (>= 30 per season) & Winter long-puffer + long-boots try-on', async ({
    page,
    request,
  }) => {
    const res = await request.get('/api/garments?closet=sample', {
      headers: { 'X-Demo-Mode': 'sample' },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const garments: Array<{
      id: number;
      name: string;
      category: string;
      subcategory: string;
      seasons: string[] | string;
      image_url: string;
    }> = json.garments || [];

    expect(garments.length).toBeGreaterThanOrEqual(120);

    const countBySeason: Record<string, number> = { 봄: 0, 여름: 0, 가을: 0, 겨울: 0 };
    for (const g of garments) {
      const sList = Array.isArray(g.seasons)
        ? g.seasons
        : typeof g.seasons === 'string'
          ? JSON.parse(g.seasons)
          : [];
      for (const s of ['봄', '여름', '가을', '겨울']) {
        if (sList.includes(s)) countBySeason[s] += 1;
      }
      expect(g.image_url).toMatch(/^\/seed\/.+\.webp$/);
    }

    expect(countBySeason['봄']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['여름']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['가을']).toBeGreaterThanOrEqual(30);
    expect(countBySeason['겨울']).toBeGreaterThanOrEqual(30);

    // Spot-check that generated seasonal .webp cutouts serve HTTP 200
    const winterLongPuffer = garments.find((g) => g.subcategory === 'long_padding');
    const summerFlipFlops = garments.find((g) => g.subcategory === 'flip_flops');
    expect(winterLongPuffer).toBeTruthy();
    expect(summerFlipFlops).toBeTruthy();

    for (const item of [winterLongPuffer!, summerFlipFlops!]) {
      const assetRes = await request.get(item.image_url);
      expect(assetRes.status()).toBe(200);
      expect(assetRes.headers()['content-type']).toContain('image/webp');
    }

    // Equip Winter long puffer + long boots in Outfits Studio
    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();

    await selectStudioSlotAndPickItem(page, 'outer', {
      season: '겨울',
      matchText: /롱패딩|숏패딩|무스탕|Puffer|Parka|Mustang/i,
    });
    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '겨울',
      matchText: /롱부츠|스노우|방한|Boots/i,
    });

    await expect(studioCanvas.locator('[data-studio-slot="outer"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="shoes"]')).toBeVisible();
  });
});
