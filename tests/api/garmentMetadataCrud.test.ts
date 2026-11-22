import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-garment-meta-api-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-garment-meta.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;

const [{ default: express }, { createApiRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/db.js'),
]);

// Minimal valid 1x1 PNG data URL
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Garment Extended Metadata API CRUD, Multi-Image Persistence & Belt Exclusion', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  let authToken = '';

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = (await loginRes.json()) as { token?: string };
    authToken = String(loginBody.token || '');
    assert.ok(authToken.length > 10);
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists and updates extended metadata fields, back/original images, and cleans up uploaded files on DELETE', async () => {
    const createRes = await fetch(`${baseUrl}/api/garments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        closet_owner: 'husband',
        name: '올리브 코듀로이 밴딩 팬츠',
        brand: 'LEMAIRE',
        category: 'bottom',
        subcategory: 'trousers',
        fabric: 'Corduroy',
        fit: 'wide',
        texture_feel: 'soft',
        material_composition: '면 98%, 폴리우레탄 2%',
        color_hex: '#4E5E3A',
        color_name: '올리브',
        seasons: ['가을', '겨울'],
        thickness: 'thick',
        formality: 'casual',
        style_mood: 'casual',
        size: 'M',
        price: 1480000,
        purchase_date: '2026-10',
        purchase_store: 'LEMAIRE 공식 온라인',
        product_code: 'PA1042-CD08',
        care_tip: '찬물 단독 세탁',
        fit_note: '허리 전체 밴딩으로 벨트 불가',
        garment_details: {
          waist_type: 'elastic',
          belt_compatible: false,
          rise: 'high',
          length_profile: 'full',
        },
        official_source_url: 'https://www.lemaire.fr/products/pa1042-cd08',
        cutout_source: 'official_web',
        image_data: TINY_PNG_DATA_URL,
        back_image_data: TINY_PNG_DATA_URL,
        original_front_data: TINY_PNG_DATA_URL,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdPayload = (await createRes.json()) as { garment: Record<string, unknown> };
    const created = createdPayload.garment;
    const id = Number(created.id);
    assert.ok(id > 0);
    assert.equal(created.fit, 'wide');
    assert.equal(created.texture_feel, 'soft');
    assert.equal(created.material_composition, '면 98%, 폴리우레탄 2%');
    assert.equal(created.thickness, 'thick');
    assert.equal(created.style_mood, 'casual');
    assert.equal(created.product_code, 'PA1042-CD08');
    assert.equal(created.cutout_source, 'official_web');
    assert.equal((created.garment_details as Record<string, unknown>)?.belt_compatible, false);
    assert.equal(String(created.image_url || '').startsWith('/uploads/'), true);
    assert.equal(String(created.back_image_url || '').startsWith('/uploads/'), true);
    assert.equal(String(created.original_front_url || '').startsWith('/uploads/'), true);

    const patchRes = await fetch(`${baseUrl}/api/garments/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        fit: 'relaxed',
        care_tip: '드라이클리닝 권장',
        garment_details: {
          waist_type: 'elastic',
          belt_compatible: false,
          rise: 'mid',
          length_profile: 'ankle',
        },
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchedPayload = (await patchRes.json()) as { garment: Record<string, unknown> };
    assert.equal(patchedPayload.garment.fit, 'relaxed');
    assert.equal(patchedPayload.garment.care_tip, '드라이클리닝 권장');
    assert.equal(
      (patchedPayload.garment.garment_details as Record<string, unknown>)?.length_profile,
      'ankle'
    );

    const delRes = await fetch(`${baseUrl}/api/garments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(delRes.status, 200);

    // Verify uploaded files were cleaned up on DELETE
    const uploadsDir = path.join(process.cwd(), 'public');
    for (const rel of [created.image_url, created.back_image_url, created.original_front_url]) {
      const fullPath = path.join(uploadsDir, String(rel).replace(/^\//, ''));
      assert.equal(fs.existsSync(fullPath), false, `Expected ${String(rel)} to be removed on DELETE`);
    }
  });

  it('excludes belts via /api/weather/recommendations when closet bottoms have belt_compatible: false', async () => {
    const isolatedCloset = 'wife';
    // Warm up seed helpers once so subsequent recommendation call does not insert new default bottoms
    await fetch(
      `${baseUrl}/api/weather/recommendations?closet=${isolatedCloset}&scenario=crisp_autumn`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const listRes = await fetch(`${baseUrl}/api/garments?closet=${isolatedCloset}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      garments: Array<{ id: number; category: string; subcategory: string }>;
    };
    for (const g of listBody.garments) {
      if (g.category === 'bottom') {
        await fetch(`${baseUrl}/api/garments/${g.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            garment_details: { waist_type: 'elastic', belt_compatible: false },
          }),
        });
      }
    }

    const beltRes = await fetch(`${baseUrl}/api/garments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        closet_owner: isolatedCloset,
        name: '포멀 레더 벨트',
        category: 'accessory',
        subcategory: 'belt',
        color_name: '블랙',
        color_hex: '#1D1D1F',
        fabric: 'Leather',
        formality: 'formal',
      }),
    });
    assert.equal(beltRes.status, 201);
    const { garment: formalBelt } = (await beltRes.json()) as { garment: { id: number } };

    const recRes = await fetch(
      `${baseUrl}/api/weather/recommendations?closet=${isolatedCloset}&scenario=crisp_autumn&look1_style=formal_office&look2_style=business_casual`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    assert.equal(recRes.status, 200);
    const recBody = (await recRes.json()) as {
      recommendations: Array<{
        loadoutBySlot: {
          bottom?: { id: number; garment_details?: { belt_compatible?: boolean } };
          acc_belt?: { id: number } | null;
        };
        items: Array<{ id: number }>;
      }>;
    };
    assert.ok(recBody.recommendations.length >= 1);
    for (const rec of recBody.recommendations) {
      assert.equal(rec.loadoutBySlot.bottom?.garment_details?.belt_compatible, false);
      assert.equal(rec.loadoutBySlot.acc_belt, null);
      assert.equal(
        rec.items.some((it) => it.id === formalBelt.id),
        false
      );
    }
  });
});
