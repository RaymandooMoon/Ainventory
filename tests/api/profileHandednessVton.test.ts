import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-handedness-vton-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-handedness.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
// Ensure VTON synthesize skips external Gemini HTTP calls and deterministically exercises pre-render pipeline
const savedGeminiKey = process.env.GEMINI_API_KEY;
const savedGoogleKey = process.env.GOOGLE_API_KEY;
const savedVtonKey = process.env.VTON_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.VTON_API_KEY;

const [
  { default: express },
  { createApiRouter },
  { createVtonRouter },
  dbMod,
  vtonServiceMod,
] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/vtonRouter.js'),
  import('../../server/db.js'),
  import('../../server/vtonService.js'),
]);

describe('Server-Side Profile Handedness Configuration & Pre-Render VTON Bag Mirroring Pipeline', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api/vton', createVtonRouter());
    app.use('/api', createApiRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
    if (savedGoogleKey !== undefined) process.env.GOOGLE_API_KEY = savedGoogleKey;
    if (savedVtonKey !== undefined) process.env.VTON_API_KEY = savedVtonKey;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults fresh server-side profile configuration handedness to right', async () => {
    const res = await fetch(`${baseUrl}/api/profile/config`, {
      method: 'GET',
      headers: {
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_fresh_default_01',
      },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      config?: {
        profileKey?: string;
        handedness?: string;
        handednessLabel?: string;
        bagCarrySide?: string;
        mirrorBagAsset?: boolean;
        hasStoredRecord?: boolean;
      };
    };
    assert.equal(body.ok, true);
    assert.equal(body.config?.profileKey, 'client_fresh_default_01');
    assert.equal(body.config?.handedness, 'right');
    assert.equal(body.config?.handednessLabel, 'right-handed');
    assert.equal(body.config?.bagCarrySide, 'left');
    assert.equal(body.config?.mirrorBagAsset, false);
    assert.equal(body.config?.hasStoredRecord, false);
  });

  it('validates handedness input (HTTP 400 on invalid value) and persists left-handed selection on the server', async () => {
    const badRes = await fetch(`${baseUrl}/api/profile/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_left_pref_02',
      },
      body: JSON.stringify({ handedness: 'ambidextrous' }),
    });
    assert.equal(badRes.status, 400);

    const saveRes = await fetch(`${baseUrl}/api/profile/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_left_pref_02',
      },
      body: JSON.stringify({ handedness: 'left-handed' }),
    });
    assert.equal(saveRes.status, 200);
    const saved = (await saveRes.json()) as {
      ok?: boolean;
      config?: {
        handedness?: string;
        handednessLabel?: string;
        bagCarrySide?: string;
        mirrorBagAsset?: boolean;
        hasStoredRecord?: boolean;
      };
    };
    assert.equal(saved.ok, true);
    assert.equal(saved.config?.handedness, 'left');
    assert.equal(saved.config?.handednessLabel, 'left-handed');
    assert.equal(saved.config?.bagCarrySide, 'right');
    assert.equal(saved.config?.mirrorBagAsset, true);
    assert.equal(saved.config?.hasStoredRecord, true);

    const getRes = await fetch(`${baseUrl}/api/profile/config`, {
      method: 'GET',
      headers: {
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_left_pref_02',
      },
    });
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()) as typeof saved;
    assert.equal(fetched.config?.handedness, 'left');
    assert.equal(fetched.config?.mirrorBagAsset, true);
    assert.equal(fetched.config?.hasStoredRecord, true);
  });

  it('explicitly checks server-side handedness in /api/vton/synthesize before rendering and mirrors bag asset position when left-handed', async () => {
    const sampleBagSlots = {
      top: {
        id: 11,
        name: '그레이 프렌치 테리 크루넥 맨투맨',
        category: 'top',
        subcategory: 'sweatshirt',
        color_hex: '#6E7175',
      },
      accessory: {
        id: 22,
        name: '브라운 이탈리안 풀그레인 레더 서류가방',
        category: 'accessory',
        subcategory: 'briefcase',
        color_hex: '#6B4423',
      },
    };

    // 1) Fresh default profile (`right`): handedness='right', bagAssetMirrored=false
    const rightSynthRes = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_fresh_default_01',
      },
      body: JSON.stringify({
        styleMode: 'stylized_isometric',
        viewAngleDeg: 0,
        turnaroundSheet: true,
        profile: { heightCm: 178, weightKg: 73 },
        slots: sampleBagSlots,
      }),
    });
    assert.equal(rightSynthRes.status, 200);
    const rightJson = (await rightSynthRes.json()) as {
      handedness?: string;
      bagAssetMirrored?: boolean;
      comboHash?: string;
    };
    assert.equal(rightJson.handedness, 'right');
    assert.equal(rightJson.bagAssetMirrored, false);

    // 2) Stored left-handed profile (`client_left_pref_02`) — even WITHOUT passing handedness in request body!
    const leftSynthRes = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
        'X-Profile-Key': 'client_left_pref_02',
      },
      body: JSON.stringify({
        styleMode: 'stylized_isometric',
        viewAngleDeg: 0,
        turnaroundSheet: true,
        profile: { heightCm: 178, weightKg: 73 },
        slots: sampleBagSlots,
      }),
    });
    assert.equal(leftSynthRes.status, 200);
    const leftJson = (await leftSynthRes.json()) as {
      handedness?: string;
      bagAssetMirrored?: boolean;
      comboHash?: string;
    };
    assert.equal(leftJson.handedness, 'left');
    assert.equal(leftJson.bagAssetMirrored, true);
    assert.notEqual(leftJson.comboHash, rightJson.comboHash);

    // 3) Verify server multimodal prompt + spatial PNG guide mirrors bag placement for left-handed
    const {
      normalizeVtonProfile,
      buildGeminiTryOnPrompt,
      buildServerBagPositionGuidePngPart,
      detectImageMimeType,
    } = vtonServiceMod as {
      normalizeVtonProfile: (raw: Record<string, unknown>) => Record<string, unknown>;
      buildGeminiTryOnPrompt: (
        profile: Record<string, unknown>,
        resolvedSlots: Record<string, Record<string, unknown>>
      ) => string;
      buildServerBagPositionGuidePngPart: (
        profile: Record<string, unknown>,
        backdropHex?: string
      ) => { mimeType: string; data: string } | null;
      detectImageMimeType: (buf: Buffer) => string | null;
    };

    const leftNormProfile = normalizeVtonProfile({
      heightCm: 178,
      weightKg: 73,
      dominantHand: 'left-handed',
      turnaroundSheet: true,
    });
    assert.equal(leftNormProfile.dominantHand, 'left');

    const promptText = buildGeminiTryOnPrompt(leftNormProfile, {
      accessory: {
        slot: 'accessory',
        name: '브라운 서류가방',
        category: 'accessory',
        subcategory: 'briefcase',
        colorName: '브라운',
        colorHex: '#6B4423',
        fabric: '가죽',
        isBag: true,
        bagAssetMirrored: true,
        bagCarrySide: 'right',
      },
    });
    assert.match(promptText, /LEFT-HANDED/);
    assert.match(promptText, /ANATOMICAL RIGHT/);
    assert.match(promptText, /BAG ASSET MIRRORING ACTIVE/);
    assert.match(promptText, /MIRRORED BAG ASSET POSITION FOR LEFT-HANDED WEARER/);

    const guidePart = buildServerBagPositionGuidePngPart(leftNormProfile, '#D8CFC4');
    assert.ok(guidePart);
    assert.equal(guidePart.mimeType, 'image/png');
    const decodedGuide = Buffer.from(guidePart.data, 'base64');
    assert.equal(detectImageMimeType(decodedGuide), 'image/png');
  });
});
