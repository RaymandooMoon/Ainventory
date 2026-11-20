import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-vton-qc-mw-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-qc-mw.db');
const qcLogPath = path.join(tmpDir, 'vton-qc-failures.log');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
process.env.AINVENTORY_VTON_QC_LOG_PATH = qcLogPath;

const [
  { default: express },
  { createVtonRouter },
  { encodeRgbaToPngDataUrl, QC_FRONT_ONLY_NOTIFICATION_POPUP },
  dbMod,
] = await Promise.all([
  import('express'),
  import('../../server/vtonRouter.js'),
  import('../../server/vtonQcMiddleware.js'),
  import('../../server/db.js'),
]);

const BACKDROP_RGB: [number, number, number] = [216, 207, 196]; // #D8CFC4 warm studio stone
const CAMEL_COAT_RGB: [number, number, number] = [176, 128, 72];
const GREY_BLAZER_RGB: [number, number, number] = [74, 80, 90];

function paintPanelFigure(params: {
  rgba: Uint8ClampedArray;
  sheetW: number;
  cellX: number;
  cellY: number;
  cellW: number;
  cellH: number;
  leftCoatRgb?: [number, number, number];
  rightCoatRgb?: [number, number, number];
  headless?: boolean;
}) {
  const {
    rgba,
    sheetW,
    cellX,
    cellY,
    cellW,
    cellH,
    leftCoatRgb = CAMEL_COAT_RGB,
    rightCoatRgb = CAMEL_COAT_RGB,
    headless = false,
  } = params;
  const cx = cellX + Math.floor(cellW / 2);
  const topY = cellY + 12;
  const botY = cellY + cellH - 12;
  const headEndY = topY + 18;
  const coatEndY = Math.round(topY + (botY - topY) * 0.56);

  for (let y = topY; y <= botY; y += 1) {
    let halfW = 19;
    if (!headless && y < headEndY) {
      halfW = 7;
    }
    for (let x = cx - halfW; x <= cx + halfW; x += 1) {
      const idx = (y * sheetW + x) * 4;
      let rgb: [number, number, number] = [56, 52, 48];
      if (!headless && y < headEndY) {
        rgb = [204, 162, 134]; // warm natural skin/hair crown
      } else if (y <= coatEndY) {
        rgb = x < cx ? leftCoatRgb : rightCoatRgb;
      }
      rgba[idx] = rgb[0];
      rgba[idx + 1] = rgb[1];
      rgba[idx + 2] = rgb[2];
      rgba[idx + 3] = 255;
    }
  }
}

function buildSyntheticTurnaroundSheetDataUrl(options?: {
  panel0SplitCoat?: boolean;
  panel45WrongColor?: boolean;
  panel0Headless?: boolean;
  otherPanelsHeadless?: boolean;
}) {
  const panelW = 120;
  const panelH = 180;
  const sheetW = panelW * 3;
  const sheetH = panelH * 2;
  const rgba = new Uint8ClampedArray(sheetW * sheetH * 4);

  for (let p = 0; p < sheetW * sheetH; p += 1) {
    const i = p * 4;
    rgba[i] = BACKDROP_RGB[0];
    rgba[i + 1] = BACKDROP_RGB[1];
    rgba[i + 2] = BACKDROP_RGB[2];
    rgba[i + 3] = 255;
  }

  const layout = [
    { angle: 0, col: 0, row: 0 },
    { angle: 45, col: 1, row: 0 },
    { angle: 90, col: 2, row: 0 },
    { angle: 135, col: 0, row: 1 },
    { angle: 180, col: 1, row: 1 },
    { angle: 225, col: 2, row: 1 },
  ];

  for (const cell of layout) {
    const is0Split = cell.angle === 0 && Boolean(options?.panel0SplitCoat);
    const is45Wrong = cell.angle === 45 && Boolean(options?.panel45WrongColor);
    const isHeadless =
      (cell.angle === 0 && Boolean(options?.panel0Headless)) ||
      (cell.angle !== 0 && Boolean(options?.otherPanelsHeadless));

    paintPanelFigure({
      rgba,
      sheetW,
      cellX: cell.col * panelW,
      cellY: cell.row * panelH,
      cellW: panelW,
      cellH: panelH,
      leftCoatRgb: is0Split || is45Wrong ? GREY_BLAZER_RGB : CAMEL_COAT_RGB,
      rightCoatRgb: is45Wrong ? GREY_BLAZER_RGB : CAMEL_COAT_RGB,
      headless: isHeadless,
    });
  }

  return encodeRgbaToPngDataUrl(sheetW, sheetH, rgba);
}

describe('Server-Side VTON QC Middleware (3x Retry, Failure Logging & Positive-Only Fallback)', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  let scenario: 'valid' | 'retry_then_pass' | 'all_fail_rescue' = 'valid';
  let observedCalls: Array<{
    cacheKey: string;
    qcCorrectionHint?: string;
    turnaroundSheet?: boolean;
  }> = [];
  let invalidatedCacheKeys: string[] = [];

  const validSheetUrl = buildSyntheticTurnaroundSheetDataUrl();
  const defectiveSheetUrl = buildSyntheticTurnaroundSheetDataUrl({
    panel0SplitCoat: false,
    panel45WrongColor: true,
    otherPanelsHeadless: true,
  });

  before(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(
      '/api/vton',
      createVtonRouter({
        qcLogFilePath: qcLogPath,
        invalidateVtonCacheImpl: (key: string) => {
          invalidatedCacheKeys.push(key);
        },
        synthesizeVtonLookImpl: async (params: Record<string, unknown>) => {
          const callIndex = observedCalls.length + 1;
          const cacheKey = `vton_test_key_${callIndex}`;
          observedCalls.push({
            cacheKey,
            qcCorrectionHint:
              typeof params.qcCorrectionHint === 'string' ? params.qcCorrectionHint : undefined,
            turnaroundSheet: Boolean(params.turnaroundSheet),
          });

          let compositeImageUrl = validSheetUrl;
          if (scenario === 'retry_then_pass') {
            compositeImageUrl = callIndex === 1 ? defectiveSheetUrl : validSheetUrl;
          } else if (scenario === 'all_fail_rescue') {
            compositeImageUrl = defectiveSheetUrl;
          }

          return {
            ok: true,
            cached: false,
            mode: '2d-vton',
            provider: 'gemini-vton',
            model: 'gemini-3.1-flash-image-preview',
            layout: params.turnaroundSheet ? 'turnaround_3x2' : 'single',
            viewAngleDeg: Number(params.viewAngleDeg) || 0,
            cacheKey,
            comboHash: 'combo_qc_test_01',
            avatarConfigHash: 'avatar_qc_test_01',
            studioBackdropHex: '#D8CFC4',
            geminiUsed: true,
            handedness: 'right',
            bagAssetMirrored: false,
            equippedSlots: ['outer', 'top', 'bottom', 'shoes'],
            compositeImageUrl,
          };
        },
      })
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
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

  it('passes a consistent 3x2 sheet on attempt 1 without writing failure logs', async () => {
    scenario = 'valid';
    observedCalls = [];
    invalidatedCacheKeys = [];

    const res = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        turnaroundSheet: true,
        viewAngleDeg: 0,
        slots: { outer: { id: 1, category: 'outer', name: '카멜 코트', color_hex: '#B08048' } },
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.qcStatus, 'passed');
    assert.equal(body.qcPassed, true);
    assert.equal(body.qcAttempts, 1);
    assert.equal(body.frontOnlyDegraded, false);
    assert.equal(observedCalls.length, 1);
    assert.equal(invalidatedCacheKeys.length, 0);
    assert.equal(fs.existsSync(qcLogPath), false);
  });

  it('retries failed QC with corrective prompt hint and serves repaired character once QC passes', async () => {
    scenario = 'retry_then_pass';
    observedCalls = [];
    invalidatedCacheKeys = [];

    const res = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        turnaroundSheet: true,
        viewAngleDeg: 45,
        slots: { outer: { id: 1, category: 'outer', name: '카멜 코트', color_hex: '#B08048' } },
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.qcStatus, 'passed');
    assert.equal(body.qcPassed, true);
    assert.equal(body.qcAttempts, 2);
    assert.equal(body.frontOnlyDegraded, false);
    assert.equal(observedCalls.length, 2);
    assert.equal(observedCalls[0].qcCorrectionHint, undefined);
    assert.ok(observedCalls[1].qcCorrectionHint && observedCalls[1].qcCorrectionHint.length > 20);
    assert.deepEqual(invalidatedCacheKeys, ['vton_test_key_1']);
  });

  it('logs failure after 3 failed QC attempts and serves positive-only (0°) fallback view with 3s popup payload', async () => {
    scenario = 'all_fail_rescue';
    observedCalls = [];
    invalidatedCacheKeys = [];
    if (fs.existsSync(qcLogPath)) fs.rmSync(qcLogPath);

    const res = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        turnaroundSheet: true,
        viewAngleDeg: 135,
        slots: { outer: { id: 1, category: 'outer', name: '카멜 코트', color_hex: '#B08048' } },
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      layout?: string;
      viewAngleDeg?: number;
      frontOnlyDegraded?: boolean;
      fallbackView?: string;
      qcStatus?: string;
      qcPassed?: boolean;
      qcAttempts?: number;
      fallbackReason?: string;
      compositeImageUrl?: string;
      qcReasons?: string[];
      notificationPopup?: typeof QC_FRONT_ONLY_NOTIFICATION_POPUP;
    };

    assert.equal(body.ok, true);
    assert.equal(body.layout, 'single');
    assert.equal(body.viewAngleDeg, 0);
    assert.equal(body.frontOnlyDegraded, true);
    assert.equal(body.fallbackView, 'positive-only');
    assert.equal(body.qcStatus, 'fallback_positive_only');
    assert.equal(body.qcPassed, false);
    assert.equal(body.qcAttempts, 3);
    assert.equal(body.fallbackReason, 'qc_front_only_fallback');
    assert.deepEqual(body.notificationPopup, QC_FRONT_ONLY_NOTIFICATION_POPUP);
    assert.equal(body.notificationPopup?.durationMs, 3000);
    assert.match(String(body.compositeImageUrl), /^data:image\/png;base64,/);

    // All 3 broken attempts invalidated in cache so bad sheets never linger
    assert.deepEqual(invalidatedCacheKeys, ['vton_test_key_1', 'vton_test_key_2', 'vton_test_key_3']);

    // Structured JSONL error written to log file on disk
    assert.equal(fs.existsSync(qcLogPath), true);
    const logLines = fs.readFileSync(qcLogPath, 'utf8').trim().split('\n');
    assert.equal(logLines.length, 1);
    const parsedLog = JSON.parse(logLines[0]) as {
      attempts?: number;
      fallbackView?: string;
      frontOnlyDegraded?: boolean;
      comboHash?: string;
      reasons?: string[];
    };
    assert.equal(parsedLog.attempts, 3);
    assert.equal(parsedLog.fallbackView, 'positive-only');
    assert.equal(parsedLog.frontOnlyDegraded, true);
    assert.equal(parsedLog.comboHash, 'combo_qc_test_01');
    assert.ok(Array.isArray(parsedLog.reasons) && parsedLog.reasons.length > 0);
  });

  it('persists client-reported 3x QC failure telemetry via POST /api/vton/qc-failure-log while rejecting unauthenticated and malformed payloads', async () => {
    if (fs.existsSync(qcLogPath)) fs.rmSync(qcLogPath);

    const unauthRes = await fetch(`${baseUrl}/api/vton/qc-failure-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comboHash: 'unauth' }),
    });
    assert.equal(unauthRes.status, 401);

    const badBodyRes = await fetch(`${baseUrl}/api/vton/qc-failure-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify(['invalid-array-body']),
    });
    assert.equal(badBodyRes.status, 400);

    const validRes = await fetch(`${baseUrl}/api/vton/qc-failure-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        comboHash: 'combo_client_left_bag_02',
        avatarConfigHash: 'avatar_hash_99',
        attempts: 3,
        reasons: ['qc_attempt_1_failed', 'qc_attempt_2_failed', 'qc_attempt_3_failed'],
        failedAngles: [45, 90, 135],
        equippedSlots: ['outer', 'accessory', 'acc_umbrella'],
        handedness: 'left',
        frontOnlyFallback: true,
        provider: 'client-gemini-vton',
        model: 'gemini-3.1-flash-image-preview',
      }),
    });
    assert.equal(validRes.status, 201);
    const validBody = (await validRes.json()) as { ok?: boolean; logged?: boolean };
    assert.equal(validBody.ok, true);
    assert.equal(validBody.logged, true);

    assert.equal(fs.existsSync(qcLogPath), true);
    const lines = fs.readFileSync(qcLogPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]) as {
      comboHash?: string;
      avatarConfigHash?: string | null;
      attempts?: number;
      handedness?: string;
      fallbackView?: string;
      frontOnlyDegraded?: boolean;
      provider?: string;
      model?: string | null;
      failedAngles?: number[];
      equippedSlots?: string[];
    };
    assert.equal(entry.comboHash, 'combo_client_left_bag_02');
    assert.equal(entry.avatarConfigHash, 'avatar_hash_99');
    assert.equal(entry.attempts, 3);
    assert.equal(entry.handedness, 'left');
    assert.equal(entry.fallbackView, 'positive-only');
    assert.equal(entry.frontOnlyDegraded, true);
    assert.equal(entry.provider, 'client-gemini-vton');
    assert.equal(entry.model, 'gemini-3.1-flash-image-preview');
    assert.deepEqual(entry.failedAngles, [45, 90, 135]);
    assert.deepEqual(entry.equippedSlots, ['outer', 'accessory', 'acc_umbrella']);

    // Verify frontOnlyFallback: false logs flatlay-fallback and strips newline control chars safely
    const flatLayRes = await fetch(`${baseUrl}/api/vton/qc-failure-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        comboHash: 'combo_flatlay\r\ninjected',
        attempts: 3,
        reasons: ['0:clipped_top\nforged_line'],
        failedAngles: [0],
        frontOnlyFallback: false,
      }),
    });
    assert.equal(flatLayRes.status, 201);
    const updatedLines = fs.readFileSync(qcLogPath, 'utf8').trim().split('\n');
    assert.equal(updatedLines.length, 2);
    const flatEntry = JSON.parse(updatedLines[1]) as {
      comboHash?: string;
      fallbackView?: string;
      frontOnlyDegraded?: boolean;
      reasons?: string[];
    };
    assert.equal(flatEntry.comboHash, 'combo_flatlay  injected');
    assert.equal(flatEntry.fallbackView, 'flatlay-fallback');
    assert.equal(flatEntry.frontOnlyDegraded, false);
    assert.deepEqual(flatEntry.reasons, ['0:clipped_top forged_line']);
  });

  it('caps Nano Banana 4x2 turnaround sheets to strictly 1 API call with zero paid retries or cache eviction', async () => {
    scenario = 'all_fail_rescue';
    observedCalls = [];
    invalidatedCacheKeys = [];
    if (fs.existsSync(qcLogPath)) fs.rmSync(qcLogPath);

    const res = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': 'sample',
      },
      body: JSON.stringify({
        turnaroundSheet: true,
        turnaroundLayout: 'turnaround_4x2',
        skipVisionQc: true,
        viewAngleDeg: 0,
        slots: { outer: { id: 1, category: 'outer', name: '카멜 코트', color_hex: '#B08048' } },
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      qcStatus?: string;
      qcPassed?: boolean;
      qcAttempts?: number;
      frontOnlyDegraded?: boolean;
      compositeImageUrl?: string;
    };

    assert.equal(body.ok, true);
    assert.equal(body.qcStatus, 'single_shot_budget_pass');
    assert.equal(body.qcPassed, true);
    assert.equal(body.qcAttempts, 1);
    assert.equal(body.frontOnlyDegraded, false);
    assert.match(String(body.compositeImageUrl), /^data:image\/png;base64,/);
    assert.equal(observedCalls.length, 1);
    assert.equal(invalidatedCacheKeys.length, 0);
    assert.equal(fs.existsSync(qcLogPath), false);
  });
});
