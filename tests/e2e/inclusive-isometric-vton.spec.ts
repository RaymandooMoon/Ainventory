import zlib from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

/**
 * Builds a valid RGBA PNG data URL (`128x128`) divided into 4 distinct solid-color quadrants
 * so we can deterministically verify client-side `sliceTurnaround2x2Sheet` across 0°/45°/90°/180°!
 */
function buildMockTurnaround2x2PngDataUrl(seedOffset = 0): string {
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // filter type 0
    const isBottom = y >= height / 2;
    for (let x = 0; x < width; x += 1) {
      const isRight = x >= width / 2;
      const px = rowOffset + 1 + x * 4;
      // Top-Left (0°), Top-Right (45°), Bottom-Left (90°), Bottom-Right (180°)
      if (!isBottom && !isRight) {
        raw[px] = (210 + seedOffset) % 255;
        raw[px + 1] = 195;
        raw[px + 2] = 180;
      } else if (!isBottom && isRight) {
        raw[px] = 180;
        raw[px + 1] = (210 + seedOffset) % 255;
        raw[px + 2] = 195;
      } else if (isBottom && !isRight) {
        raw[px] = 185;
        raw[px + 1] = 190;
        raw[px + 2] = (220 + seedOffset) % 255;
      } else {
        raw[px] = (225 + seedOffset) % 255;
        raw[px + 1] = 215;
        raw[px + 2] = 175;
      }
      raw[px + 3] = 255;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

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
    const target = options?.matchText
      ? cards.filter({ hasText: options.matchText }).first()
      : cards.first();
    await expect(target).toBeVisible();
    const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
    if ((await target.getAttribute('aria-pressed')) === 'true') {
      await page.keyboard.press('Escape');
    } else {
      await target.click();
    }
    return pickedId;
  }

  await page.locator(`[data-outfit-slot-tab="${slotKey}"]`).click();
  const picker = page.locator(`#${CARBON_DOM_CONTRACT.studioSlotPickerId}`);
  if (options?.season) {
    await picker.locator(`[data-outfit-season-filter="${options.season}"]`).click();
  }
  const cards = picker.locator('[data-slot-garment-id]');
  const target = options?.matchText
    ? cards.filter({ hasText: options.matchText }).first()
    : cards.first();
  await expect(target).toBeVisible();
  const pickedId = (await target.getAttribute('data-slot-garment-id')) || '';
  if ((await target.getAttribute('aria-pressed')) !== 'true') {
    await target.click();
  }
  return pickedId;
}

function setRangeSliderValue(page: Page, sliderSelector: string, nextValue: number) {
  return page.locator(sliderSelector).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    setter?.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, nextValue);
}

test.describe('Zero-Procedural Editorial Flat-Lay Board & 100% Gemini Multimodal Multi-Angle VTON', () => {
  test('1. Zero procedural drawing (<canvas>/polygon human = 0), default Editorial Flat-Lay Board, and 4-angle controls (0°/45°/90°/180°)', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    const modelStage = page.locator(`#${CARBON_DOM_CONTRACT.character25dMannequinId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(modelStage).toBeVisible();

    // Strictly ZERO <canvas> or procedural SVG human fallback elements on stage
    await expect(studioCanvas.locator('canvas')).toHaveCount(0);
    await expect(studioCanvas.locator('.character-25d-fallback-svg')).toHaveCount(0);

    // Default view is Editorial Flat-Lay Board at 45°
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'flatlay');
    await expect(studioCanvas).toHaveAttribute('data-vton-provider', 'flatlay-lookbook');
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');
    await expect(modelStage).toHaveAttribute('data-view-angle', '45');
    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();

    // Step clockwise through all 4 canonical turnaround angles (45 -> 90 -> 180 -> 0 -> 45)
    const cwBtn = studioCanvas.locator('[data-iso-rotate-btn="cw"]');
    const ccwBtn = studioCanvas.locator('[data-iso-rotate-btn="ccw"]');
    for (const expectedDeg of ['90', '180', '0', '45']) {
      await cwBtn.click();
      await expect(studioCanvas).toHaveAttribute('data-view-angle', expectedDeg);
      await expect(modelStage).toHaveAttribute('data-view-angle', expectedDeg);
      await expect(studioCanvas.locator('canvas')).toHaveCount(0);
    }

    // Direct 4-angle quick pills & reset badge
    await studioCanvas.locator('[data-vton-angle-btn="90"]').click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    await studioCanvas.locator('[data-iso-angle-badge]').click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '45');

    await ccwBtn.click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '0');
  });

  test('2. Inclusive Avatar Studio: 4 frames, high-BMI coupled metrics (164cm/103kg), MST 1-10 x 4, hair/beard & hash sync', async ({
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
    await expect(page.locator('.skin-modal-character-stage canvas')).toHaveCount(0);
    await expect(
      page.locator('.skin-modal-character-stage [data-avatar-spec-card="true"]')
    ).toBeVisible();
    await page.locator('#profile-tab-body').click();

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

    await page.locator(`#${CARBON_DOM_CONTRACT.skinToneApplyBtnId}`).click();
    await expect(studioCanvas).toHaveAttribute('data-avatar-hash', modalLiveHash!);
    await expect(modelStage).toHaveAttribute('data-height-cm', '164');
    await expect(modelStage).toHaveAttribute('data-weight-kg', '103');
  });

  test('3. Editorial Flat-Lay Board 0ms 1:1 slot sync, aspect-ratio preservation, swimwear + flip-flops, and instant unequip', async ({
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

    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId} [data-weather-rec-id]`).first()
    ).toBeVisible();
    const resetBtn = page.getByRole('button', { name: /착장 초기화|Reset Outfit/i });
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
    }
    await expect(studioCanvas).toHaveAttribute('data-equipped-count', '0');
    await expect(studioCanvas.locator('[data-flatlay-empty="true"]')).toBeVisible();

    await selectStudioSlotAndPickItem(page, 'onepiece', {
      season: '여름',
      matchText: /수영복|비키니|래시가드|Swim|Bikini|Rashguard/i,
    });
    await selectStudioSlotAndPickItem(page, 'shoes', {
      season: '여름',
      matchText: /쪼리|플립플랍|샌들|Flip|Sandal/i,
    });
    await selectStudioSlotAndPickItem(page, 'accessory', {
      season: '여름',
      matchText: /선글라스|버킷햇|토트|Sunglasses|Bucket|Tote/i,
    });

    // Instant 0ms Flat-Lay Lookbook placement with object-fit: contain (zero distortion)
    const flatLayBoard = studioCanvas.locator('[data-flatlay-board="true"]');
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="onepiece"]')).toBeVisible();
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="shoes"]')).toBeVisible();
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="accessory"]')).toBeVisible();

    const objectFitVal = await flatLayBoard
      .locator('[data-flatlay-item-slot="onepiece"] img')
      .evaluate((el) => window.getComputedStyle(el).objectFit);
    expect(objectFitVal).toBe('contain');

    // Unequip swimwear -> instant removal with zero ghost residual
    await studioCanvas.locator('[data-studio-slot="onepiece"] .studio-worn-slot-remove').click();
    await expect(studioCanvas.locator('[data-studio-slot="onepiece"]')).toHaveCount(0);
    await expect(flatLayBoard.locator('[data-flatlay-item-slot="onepiece"]')).toHaveCount(0);
  });

  test('4. 100% Gemini Multimodal VTON: missing-key Flat-Lay toast fallback, 2x2 turnaround slicing (0°/45°/90°/180°), IndexedDB 0ms cache, and Style toggle', async ({
    page,
  }) => {
    await page.goto('/outfits');

    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId} [data-weather-rec-id]`).first()
    ).toBeVisible();
    await expect(studioCanvas.locator('[data-studio-slot="top"]')).toBeVisible();

    // Part A: Without API key configured on local test server, clicking AI Try-On NEVER draws a polygon human;
    // it preserves the Editorial Flat-Lay Board and shows a clean status toast!
    await studioCanvas.locator('[data-viewer-stage-btn="ai-vton"]').click();
    await expect(studioCanvas.locator('[data-vton-status-toast="true"]')).toBeVisible();
    await expect(studioCanvas).toHaveAttribute('data-stage-mode', 'flatlay');
    await expect(studioCanvas.locator('[data-flatlay-board="true"]')).toBeVisible();
    await expect(studioCanvas.locator('canvas')).toHaveCount(0);

    // Dismiss toast
    await studioCanvas.locator('[data-vton-status-toast="true"]').click();

    // Part B: Mock Gemini `/api/vton/synthesize` returning a 2x2 Turnaround Studio Sheet
    const sheetPhoto = buildMockTurnaround2x2PngDataUrl(10);
    const sheetStylized = buildMockTurnaround2x2PngDataUrl(60);
    const capturedBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/vton/synthesize', async (route) => {
      const postData = route.request().postDataJSON() as Record<string, unknown>;
      capturedBodies.push(postData);
      // Small delay so glassmorphism shimmer overlay is observable
      await new Promise((r) => setTimeout(r, 120));
      const requestedStyle = String(postData?.styleMode || 'photorealistic');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cached: false,
          mode: '2d-vton',
          provider: 'gemini-vton',
          model: 'gemini-2.5-flash-image',
          layout: 'turnaround_2x2',
          styleMode: requestedStyle,
          geminiUsed: true,
          compositeImageUrl:
            requestedStyle === 'stylized_isometric' ? sheetStylized : sheetPhoto,
        }),
      });
    });

    await studioCanvas.locator('[data-viewer-stage-btn="ai-vton"]').click();
    await expect(studioCanvas.locator('[data-vton-shimmer-overlay="true"]')).toBeVisible();

    const aiImg = studioCanvas.locator('[data-ai-vton-img="true"]');
    await expect(aiImg).toBeVisible();
    await expect(studioCanvas).toHaveAttribute('data-vton-provider', 'gemini-vton');
    expect(capturedBodies.length).toBe(1);

    // Verify multimodal payload sent real Base64 garment inlineData + AvatarSpec + weather mood
    const firstPayload = capturedBodies[0] as {
      styleMode?: string;
      turnaroundSheet?: boolean;
      avatarSpec?: { anthropometrics?: { heightCm?: number } };
      slots?: Record<string, { packshotDataUrl?: string }>;
    };
    expect(firstPayload.styleMode).toBe('photorealistic');
    expect(firstPayload.turnaroundSheet).toBe(true);
    expect(firstPayload.avatarSpec?.anthropometrics?.heightCm).toBeGreaterThanOrEqual(140);
    const topSlotPayload = firstPayload.slots?.top;
    expect(topSlotPayload?.packshotDataUrl).toMatch(/^data:image\//);

    const slice45 = await aiImg.getAttribute('src');
    expect(slice45).toMatch(/^data:image\/png;base64,/);

    // Switch to 90° Side Profile & 180° Back -> 0ms IndexedDB/Memory slice hit with ZERO extra API calls!
    await studioCanvas.locator('[data-vton-angle-btn="90"]').click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '90');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    const slice90 = await aiImg.getAttribute('src');
    expect(slice90).not.toBe(slice45);
    expect(capturedBodies.length).toBe(1);

    await studioCanvas.locator('[data-vton-angle-btn="180"]').click();
    await expect(studioCanvas).toHaveAttribute('data-view-angle', '180');
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    const slice180 = await aiImg.getAttribute('src');
    expect(slice180).not.toBe(slice90);
    expect(capturedBodies.length).toBe(1);

    // Toggle style to Stylized Isometric -> triggers Gemini with `stylized_isometric` prompt
    await studioCanvas.locator('[data-vton-style-toggle="stylized_isometric"]').click();
    await expect.poll(() => capturedBodies.length).toBe(2);
    expect(capturedBodies[1].styleMode).toBe('stylized_isometric');
    await expect(aiImg).toBeVisible();

    // Toggling back to Photorealistic hits cache in 0ms with zero extra API call!
    await studioCanvas.locator('[data-vton-style-toggle="photorealistic"]').click();
    await expect(studioCanvas).toHaveAttribute('data-vton-cached', 'true');
    expect(capturedBodies.length).toBe(2);
  });

  test('5. 4-Season 128-item photorealistic catalog (>= 30 per season) & Winter long-puffer + long-boots Flat-Lay styling', async ({
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

    const winterLongPuffer = garments.find((g) => g.subcategory === 'long_padding');
    const summerFlipFlops = garments.find((g) => g.subcategory === 'flip_flops');
    expect(winterLongPuffer).toBeTruthy();
    expect(summerFlipFlops).toBeTruthy();

    for (const item of [winterLongPuffer!, summerFlipFlops!]) {
      const assetRes = await request.get(item.image_url);
      expect(assetRes.status()).toBe(200);
      expect(assetRes.headers()['content-type']).toContain('image/webp');
    }

    await page.goto('/outfits');
    const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
    await expect(studioCanvas).toBeVisible();
    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.weatherRecommendPanelId} [data-weather-rec-id]`).first()
    ).toBeVisible();
    const resetBtn = page.getByRole('button', { name: /착장 초기화|Reset Outfit/i });
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
    }
    await expect(studioCanvas).toHaveAttribute('data-equipped-count', '0');

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
    await expect(studioCanvas.locator('[data-flatlay-item-slot="outer"]')).toBeVisible();
    await expect(studioCanvas.locator('[data-flatlay-item-slot="shoes"]')).toBeVisible();
  });
});
