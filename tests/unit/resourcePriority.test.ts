import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import { createJsonGzipMiddleware } from '../../server/httpCompression.js';
import {
  computeNextVisibleBatch,
  resolveImageLoadingProps,
  scheduleAfterFirstPaint,
  scheduleIdleTask,
  staggeredImagePreload,
} from '../../src/utils/resourcePriority.ts';

test('resolveImageLoadingProps prioritizes eager/high images and defers below-the-fold images', () => {
  assert.deepEqual(resolveImageLoadingProps({ eager: true }), {
    loading: 'eager',
    decoding: 'async',
    fetchPriority: 'high',
  });

  assert.deepEqual(resolveImageLoadingProps({ eager: false }), {
    loading: 'lazy',
    decoding: 'async',
    fetchPriority: 'low',
  });

  assert.deepEqual(resolveImageLoadingProps({ eager: false, priority: 'high' }), {
    loading: 'eager',
    decoding: 'async',
    fetchPriority: 'high',
  });

  assert.deepEqual(resolveImageLoadingProps({ eager: true, priority: 'auto' }), {
    loading: 'eager',
    decoding: 'async',
    fetchPriority: 'auto',
  });
});

test('computeNextVisibleBatch expands progressively and clamps to totalCount', () => {
  assert.equal(computeNextVisibleBatch(16, 262, 20), 36);
  assert.equal(computeNextVisibleBatch(250, 262, 20), 262);
  assert.equal(computeNextVisibleBatch(0, 0, 20), 0);
  assert.equal(computeNextVisibleBatch(-5, 10, 4), 4);
});

test('staggeredImagePreload prioritizes activeUrl immediately and staggers secondary URLs', async () => {
  const created: Array<{ src: string; fetchPriority?: string; decoding?: string }> = [];
  const OriginalImage = globalThis.Image;

  class MockImage {
    src = '';
    decoding = '';
    fetchPriority = '';
    decode() {
      return Promise.resolve();
    }
    constructor() {
      created.push(this);
    }
  }

  (globalThis as unknown as { Image: unknown }).Image = MockImage;
  try {
    const cancel = staggeredImagePreload(
      ['/angle-45.webp', '/angle-0.webp', '/angle-90.webp', '/angle-0.webp'],
      { activeUrl: '/angle-0.webp', delayMs: 25 }
    );

    // Active URL must load synchronously at high priority before any secondary slice
    assert.equal(created.length, 1);
    assert.equal(created[0].src, '/angle-0.webp');
    assert.equal(created[0].fetchPriority, 'high');
    assert.equal(created[0].decoding, 'async');

    await new Promise((resolve) => setTimeout(resolve, 160));
    cancel();

    assert.equal(created.length, 3);
    assert.deepEqual(
      created.map((img) => ({ src: img.src, priority: img.fetchPriority })),
      [
        { src: '/angle-0.webp', priority: 'high' },
        { src: '/angle-45.webp', priority: 'low' },
        { src: '/angle-90.webp', priority: 'low' },
      ]
    );
  } finally {
    (globalThis as unknown as { Image: unknown }).Image = OriginalImage;
  }
});

test('scheduleAfterFirstPaint and scheduleIdleTask execute and support cancellation', async () => {
  let ranPaint = false;
  let cancelledPaint = false;
  scheduleAfterFirstPaint(() => {
    ranPaint = true;
  });
  const cancelPaint = scheduleAfterFirstPaint(() => {
    cancelledPaint = true;
  });
  cancelPaint();

  let ranIdle = false;
  let cancelledIdle = false;
  scheduleIdleTask(() => {
    ranIdle = true;
  }, 50);
  const cancelIdle = scheduleIdleTask(() => {
    cancelledIdle = true;
  }, 50);
  cancelIdle();

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(ranPaint, true);
  assert.equal(cancelledPaint, false);
  assert.equal(ranIdle, true);
  assert.equal(cancelledIdle, false);
});

test('createJsonGzipMiddleware compresses large JSON payloads when gzip is accepted', () => {
  const middleware = createJsonGzipMiddleware({ thresholdBytes: 128 });
  const headers: Record<string, string> = {};
  let sentBody: unknown = null;

  const req = {
    method: 'GET',
    headers: { 'accept-encoding': 'gzip, deflate, br' },
  };
  const res = {
    headersSent: false,
    setHeader(name: string, val: string) {
      headers[name.toLowerCase()] = val;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    json(body: unknown) {
      sentBody = body;
      return this;
    },
    send(body: unknown) {
      sentBody = body;
      return this;
    },
  };

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  const payload = {
    garments: Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      name: `Cashmere Atelier Trench Coat #${i + 1}`,
      brand: 'Ainventory Studio',
      category: 'outer',
    })),
  };
  res.json(payload);

  assert.equal(headers['content-encoding'], 'gzip');
  assert.equal(headers.vary, 'Accept-Encoding');
  assert.ok(Buffer.isBuffer(sentBody));
  const rawLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  assert.ok((sentBody as Buffer).length < rawLength * 0.5);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(sentBody as Buffer).toString('utf8')), payload);
});
