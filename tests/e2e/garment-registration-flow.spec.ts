import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
import { CARBON_DOM_CONTRACT } from '../../src/contracts/carbonDesignContract.ts';

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makeFlatlayPngBuffer(
  bgRgb: [number, number, number],
  garmentRgb: [number, number, number],
  width = 160,
  height = 180
): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4;
      const inWaist = y >= 28 && y <= 50 && x >= 34 && x <= 126;
      const inLeftLeg = y > 50 && y <= 158 && x >= 34 && x <= 74;
      const inRightLeg = y > 50 && y <= 158 && x >= 86 && x <= 126;
      const isGarment = inWaist || inLeftLeg || inRightLeg;
      const [r, g, b] = isGarment ? garmentRgb : bgRgb;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

test.describe('Guided 2-Photo Garment Registration, Hybrid Cutout, Web Match & Metadata Propagation', () => {
  let authToken = '';

  test.beforeEach(async ({ page }) => {
    const loginRes = await page.request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = await loginRes.json();
    authToken = String(loginJson.token || '');
    expect(authToken.length).toBeGreaterThan(10);

    await page.addInitScript((token) => {
      window.localStorage.setItem('ainventory_lang_v1', 'ko');
      window.localStorage.setItem('ainventory_auth_token', token);
      window.localStorage.setItem('ainventory_sample_demo_mode', '0');
    }, authToken);
  });

  test('1. Floor-shot corduroy pants (Front+Back+Tag) -> Vision AI + Web Proposal + AI Studio Cutout -> Closet & ItemDetailSheet Front/Back/Original + No Bleed/CPW Clip', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const floorShotFront = makeFlatlayPngBuffer([176, 146, 114], [78, 94, 58]);
    const floorShotBack = makeFlatlayPngBuffer([172, 142, 110], [72, 88, 54]);
    const tagPhoto = makeFlatlayPngBuffer([236, 234, 228], [32, 32, 36], 120, 96);
    const officialWhiteStudioPng = makeFlatlayPngBuffer([255, 255, 255], [76, 92, 56]);
    const aiStudioBackPng = makeFlatlayPngBuffer([255, 255, 255], [68, 84, 52]);

    const captured: {
      vision: Record<string, unknown> | null;
      webLookup: Record<string, unknown> | null;
      studioCutout: Record<string, unknown> | null;
    } = {
      vision: null,
      webLookup: null,
      studioCutout: null,
    };

    await page.route('**/api/garments/vision-analyze', async (route) => {
      captured.vision = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          analysis: {
            category: 'bottom',
            subcategory: 'trousers',
            name_ko: '올리브 코듀로이 와이드 밴딩 팬츠',
            name_en: 'Olive Corduroy Wide Elastic Pants',
            color_name: '올리브',
            color_hex: '#4E5E3A',
            material: 'Corduroy',
            texture_feel: 'soft',
            fit: 'wide',
            seasons: ['가을', '겨울'],
            thickness: 'thick',
            water_resistant: false,
            style_mood: 'casual',
            formality: 'casual',
            garment_details: {
              waist_type: 'elastic',
              belt_compatible: false,
              rise: 'high',
              length_profile: 'full',
              back_detail: 'patch_pockets',
            },
            suggested_fit_note: '허리 전체 밴딩으로 편안하며 벨트 고리가 없음',
            brand: 'LEMAIRE',
            product_code: 'PA1042-CD08',
            size: 'M',
            material_composition: '면 98%, 폴리우레탄 2%',
            care_tip: '뒤집어서 찬물 단독 세탁, 건조기 금지',
            has_tag_images: true,
            has_identifiable_product: true,
            web_search_query: 'LEMAIRE PA1042-CD08 olive corduroy wide elastic pants',
            background_quality: {
              hasClutterOrBodyPart: true,
              reason: 'wood floor and foot edge visible',
            },
          },
        }),
      });
    });

    await page.route('**/api/garments/web-lookup', async (route) => {
      captured.webLookup = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          match: {
            found: true,
            brand: 'LEMAIRE',
            product_code: 'PA1042-CD08',
            official_name: '르메르 올리브 코듀로이 밴딩 와이드 팬츠',
            color_name: '올리브',
            material: 'Corduroy',
            material_composition: '면 98%, 폴리우레탄 2%',
            fit: 'wide',
            retail_price_krw: 1480000,
            purchase_store: 'LEMAIRE 공식 온라인',
            care_tip: '찬물 단독 세탁 또는 드라이클리닝 권장',
            fit_summary: '여유로운 와이드 스트레이트 실루엣, 풀 밴딩 허리',
            official_source_url: 'https://www.lemaire.fr/products/pa1042-cd08',
            official_image_data: makeDataUrl(officialWhiteStudioPng),
            sources: [{ title: 'LEMAIRE Official', uri: 'https://www.lemaire.fr/products/pa1042-cd08' }],
          },
        }),
      });
    });

    await page.route('**/api/garments/studio-cutout', async (route) => {
      captured.studioCutout = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          studioImageDataUrl: makeDataUrl(aiStudioBackPng),
        }),
      });
    });

    await page.goto('/closet');
    await expect(
      page.locator(`#${CARBON_DOM_CONTRACT.wardrobeGridId} .hig-wardrobe-card`).first()
    ).toBeVisible();

    // Open Guided Add Modal
    await page.locator(`#${CARBON_DOM_CONTRACT.wardrobeOpenAddBtnId}`).click();
    const sheetBox = page.locator('.ui-sheet-box').last();
    await expect(sheetBox).toBeVisible();

    // Verify modal sheet opacity prevents Closet/tabbar bleed-through (alpha >= 0.92)
    const sheetAlpha = await sheetBox.evaluate((el) => {
      const bg = window.getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\s*\)/);
      return m ? (m[1] === undefined ? 1 : Number(m[1])) : 0;
    });
    expect(sheetAlpha).toBeGreaterThanOrEqual(0.92);

    // Step 0: Start CTA stays disabled until both Front and Back photos are chosen
    const startBtn = page.locator('.hig-capture-step button.hig-primary-cta-btn');
    await expect(startBtn).toBeDisabled();

    // Upload Front (camera-like filename should never leak into name input)
    await page.locator(`#${CARBON_DOM_CONTRACT.wardrobeGalleryInputId}`).setInputFiles({
      name: 'IMG_20261121_179526.png',
      mimeType: 'image/png',
      buffer: floorShotFront,
    });
    await expect(startBtn).toBeDisabled();

    // Upload Back + Optional Neck/Care Tag photo
    await page.locator('.hig-add-garment-form input[type="file"]').nth(2).setInputFiles({
      name: 'IMG_20261121_179527.png',
      mimeType: 'image/png',
      buffer: floorShotBack,
    });
    await page.locator('.hig-add-garment-form input[type="file"]').nth(4).setInputFiles({
      name: 'IMG_20261121_179528_tag.png',
      mimeType: 'image/png',
      buffer: tagPhoto,
    });
    await expect(page.locator('.hig-tag-thumb-item')).toHaveCount(1);
    await expect(startBtn).toBeEnabled();

    // Begin AI analysis + background cutout + official web lookup
    await startBtn.click();

    // Verify Vision AI payload contained front + back + 1 tag image
    await expect.poll(() => captured.vision !== null).toBe(true);
    expect(Array.isArray(captured.vision?.tag_images)).toBe(true);
    expect((captured.vision?.tag_images as unknown[]).length).toBe(1);

    // Verify Vision AI pre-filled Step 1 fields & flagged AI Studio refinement recommendation
    await expect(page.locator('#add-garment-name-input')).toHaveValue('올리브 코듀로이 와이드 밴딩 팬츠');
    await expect(page.locator('.hig-reg-mini-btn.is-recommended')).toBeVisible();

    // Verify Official Web Product Proposal Card appears from tag lookup
    await expect.poll(() => captured.webLookup !== null).toBe(true);
    const webCard = page.locator('.hig-web-match-card');
    await expect(webCard).toBeVisible();
    await expect(webCard).toContainText('LEMAIRE');
    await expect(webCard).toContainText('₩1,480,000');

    // Test Back side + AI Studio Cutout button on CompactPreviewBar
    await page.locator('.hig-reg-sticky-preview [role="tab"]', { hasText: '뒷면' }).click();
    await page.locator('.hig-reg-sticky-preview button', { hasText: 'AI 스튜디오 보정' }).click();
    await expect.poll(() => captured.studioCutout?.side).toBe('back');
    await expect(page.locator('.hig-reg-sticky-preview')).toContainText('AI 스튜디오 누끼 완료');

    // Apply Official Photo + Info from Web Proposal Card
    await webCard.locator('.hig-web-apply-primary').click();
    await expect(webCard).toHaveCount(0);
    await expect(page.locator('#add-garment-name-input')).toHaveValue(
      '르메르 올리브 코듀로이 밴딩 와이드 팬츠'
    );
    await expect(page.locator('.hig-reg-sticky-preview')).toContainText('공식 상품 이미지 적용됨');

    // Step 2: Confirm elastic waist & belt_compatible: false state persisted
    await page.locator('.hig-step-bar [role="tab"]').nth(1).click();
    await expect(page.locator('.hig-step-panel')).toContainText('전체 밴딩');
    await expect(page.locator('.hig-step-panel')).toContainText('벨트 불가');

    // Step 3: Confirm price, brand, product code, composition, care tip from official match
    await page.locator('.hig-step-bar [role="tab"]').nth(2).click();
    await expect(page.locator('#add-garment-brand-input')).toHaveValue('LEMAIRE');
    await expect(page.locator('#add-garment-code-input')).toHaveValue('PA1042-CD08');
    await expect(page.locator('#add-garment-price-input')).toHaveValue('1480000');
    await expect(page.locator('#add-garment-comp-input')).toHaveValue('면 98%, 폴리우레탄 2%');

    // Submit garment to real Express backend
    const createResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/garments') && res.request().method() === 'POST'
    );
    await page.locator(`#${CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}`).click();
    const createRes = await createResponsePromise;
    expect(createRes.status()).toBe(201);
    const { garment: createdGarment } = await createRes.json();
    expect(createdGarment.id).toBeTruthy();
    expect(createdGarment.back_image_url).toBeTruthy();
    expect(createdGarment.original_front_url).toBeTruthy();
    expect(createdGarment.garment_details?.belt_compatible).toBe(false);
    expect(createdGarment.fit).toBe('wide');

    try {
      // Verify registered card appears in Closet grid and open ItemDetailSheet
      const registeredCard = page
        .locator(`#${CARBON_DOM_CONTRACT.wardrobeGridId} .hig-wardrobe-card`, {
          hasText: '르메르 올리브 코듀로이 밴딩 와이드 팬츠',
        })
        .first();
      await expect(registeredCard).toBeVisible();
      await registeredCard.click();

      const detailSheet = page.locator(`#${CARBON_DOM_CONTRACT.garmentDetailSheetId}`);
      await expect(detailSheet).toBeVisible();

      // Verify ItemDetailSheet has Front / Back / My Photo (내 실사) tabs and switches src cleanly
      const sideSwitcher = detailSheet.locator('.hig-detail-side-switcher');
      await expect(sideSwitcher).toBeVisible();
      const stageImg = detailSheet.locator(`#${CARBON_DOM_CONTRACT.itemDetailTiltStageId} img`);
      const frontSrc = await stageImg.getAttribute('src');
      expect(frontSrc).toBeTruthy();

      await sideSwitcher.locator('[role="tab"]', { hasText: '뒷면' }).click();
      await expect
        .poll(async () => stageImg.getAttribute('src'))
        .not.toBe(frontSrc);

      await sideSwitcher.locator('[role="tab"]', { hasText: '실사' }).click();
      await expect
        .poll(async () => stageImg.getAttribute('src'))
        .toBe(createdGarment.original_front_url);

      // Verify 7-digit KRW price / CPW cell does not clip with ellipsis on mobile (393px)
      const kpiMetrics = await detailSheet.locator('.hig-detail-kpi-value').evaluateAll((els) =>
        els.map((el) => ({
          text: el.textContent?.trim() || '',
          clipped: el.scrollWidth > el.clientWidth + 1,
        }))
      );
      const cpwCell = kpiMetrics.find((m) => m.text.includes('₩1,480,000'));
      expect(cpwCell).toBeTruthy();
      expect(cpwCell?.clipped).toBe(false);

      // Verify wearing details summary badge displays 벨트 불가
      await expect(detailSheet).toContainText('벨트 불가');

      // Verify weather recommendations API honors belt_compatible === false when a belt is in the same closet
      const authHeaders = { Authorization: `Bearer ${authToken}` };
      const beltCreateRes = await page.request.post('/api/garments', {
        headers: authHeaders,
        data: {
          closet_owner: createdGarment.closet_owner,
          name: 'E2E 테스트 레더 벨트',
          category: 'accessory',
          subcategory: 'belt',
          color_name: '블랙',
          color_hex: '#1D1D1F',
          fabric: 'Leather',
          formality: 'formal',
        },
      });
      expect(beltCreateRes.status()).toBe(201);
      const { garment: createdBelt } = await beltCreateRes.json();
      try {
        const recRes = await page.request.get(
          `/api/weather/recommendations?closet=${encodeURIComponent(createdGarment.closet_owner)}&scenario=crisp_autumn&look1_style=formal_office&look2_style=comfortable_casual`,
          { headers: authHeaders }
        );
        expect(recRes.ok()).toBeTruthy();
        const recPayload = await recRes.json();
        const recs = Array.isArray(recPayload.recommendations) ? recPayload.recommendations : [];
        for (const rec of recs) {
          if (rec?.loadoutBySlot?.bottom?.id === createdGarment.id) {
            expect(rec.loadoutBySlot.acc_belt).toBeNull();
            expect(
              (rec.items || []).some((it: { id: number }) => it.id === createdBelt.id)
            ).toBe(false);
          }
        }
      } finally {
        await page.request.delete(`/api/garments/${createdBelt.id}`, { headers: authHeaders });
      }

      // Verify Try in Outfits opens studio with the corduroy pants pre-equipped
      await detailSheet.locator(`#${CARBON_DOM_CONTRACT.itemDetailTryOutfitBtnId}`).click();
      await expect(page).toHaveURL(/\/outfits$/);
      const studioCanvas = page.locator(`#${CARBON_DOM_CONTRACT.studio25dCanvasId}`);
      await expect(studioCanvas).toBeVisible();
      await expect(studioCanvas.locator('[data-flatlay-item-slot="bottom"]')).toBeVisible();
    } finally {
      await page.request.delete(`/api/garments/${createdGarment.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }

    expect(pageErrors).toEqual([]);
  });
});
