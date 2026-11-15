import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { BodyShapeKey } from '../../src/contracts/carbonDesignContract.ts';
import { normalizeBodyShape } from '../../src/services/parametricAvatar3D.ts';
import { ApiError, apiFetch } from '../../src/utils/api.ts';
import { normalizeBodyShapeKey } from '../../src/utils/bodyAnthropometrics.js';
import { pushBackHandler } from '../../src/utils/nativeBridge.ts';
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  getQueuedMutationCount,
  purgeAllLocalUserData,
  readCachedResponse,
  subscribeOfflineSync,
  writeCachedResponse,
} from '../../src/utils/offlineSync.ts';

const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await purgeAllLocalUserData();
});

describe('Phase 3: Client API Gateway Guard, Offline Sync Dead-Letter/Retry & Type Alignment', () => {
  it('does not fall back to standalone data on non-JSON 401/403/429 gateway responses', async () => {
    for (const status of [401, 403, 429]) {
      globalThis.fetch = (async () =>
        new Response('<html>Gateway Denied</html>', {
          status,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })) as typeof fetch;

      await assert.rejects(
        () => apiFetch('/garments?closet=husband'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, status);
          assert.equal(err.isBackendUnavailable, false);
          return true;
        }
      );
    }
  });

  it('dead-letters permanent 4xx mutations, invalidates optimistic cache, and notifies listeners', async () => {
    await writeCachedResponse('/garments?closet=husband', {
      garments: [{ id: -999, name: 'Optimistic Phantom Coat' }],
    });

    await enqueueOfflineMutation({
      path: '/garments',
      method: 'POST',
      body: { name: 'Invalid Garment', closet_owner: 'husband' },
      tempId: -999,
    });
    assert.equal(await getQueuedMutationCount(), 1);

    const events: Array<{ queuedCount: number; deadLettered?: number }> = [];
    const unsub = subscribeOfflineSync((snap) => events.push(snap));

    try {
      const flushed = await flushOfflineQueue(async () => {
        throw new ApiError('Validation failed', { status: 422, isBackendUnavailable: false });
      });
      assert.equal(flushed, 0);
      assert.equal(await getQueuedMutationCount(), 0);

      // Optimistic cache for /garments must be invalidated so phantom item disappears
      const afterCache = await readCachedResponse('/garments?closet=husband');
      assert.equal(afterCache, null);

      const deadLetters = await readCachedResponse<{ items?: Array<{ status: number }> }>(
        '__dead_letter_mutations__'
      );
      assert.equal(deadLetters?.items?.length, 1);
      assert.equal(deadLetters?.items?.[0]?.status, 422);
      assert.ok(events.some((e) => (e.deadLettered ?? 0) >= 1));
    } finally {
      unsub();
    }
  });

  it('caps transient 5xx retries at 5 attempts so subsequent queued mutations are unblocked', async () => {
    await enqueueOfflineMutation({
      path: '/outfits',
      method: 'POST',
      body: { name: 'Poisoned Outfit' },
    });
    await enqueueOfflineMutation({
      path: '/wear-logs',
      method: 'POST',
      body: { worn_date: '2026-11-15', note: 'Healthy Log' },
    });

    const sendStub = async (reqPath: string): Promise<Record<string, unknown>> => {
      if (reqPath === '/outfits') {
        throw new ApiError('Upstream 500', { status: 500, isBackendUnavailable: false });
      }
      return { ok: true, id: 77 };
    };

    // Attempts 1..4 keep the transient item queued
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const flushed = await flushOfflineQueue(sendStub);
      assert.equal(flushed, 0);
      assert.equal(await getQueuedMutationCount(), 2);
    }

    // Attempt 5 reaches retry cap, dead-letters /outfits, and flushes /wear-logs in the same pass
    const finalFlushed = await flushOfflineQueue(sendStub);
    assert.equal(finalFlushed, 1);
    assert.equal(await getQueuedMutationCount(), 0);
  });

  it('manages back handler stack immutably on registration and unregistration', () => {
    let calledA = false;
    let calledB = false;
    const unsubA = pushBackHandler(() => {
      calledA = true;
    });
    const unsubB = pushBackHandler(() => {
      calledB = true;
    });
    unsubB();
    unsubA();
    assert.equal(calledA, false);
    assert.equal(calledB, false);
  });

  it('aligns all contract BodyShapeKey literals across anthropometrics and 3D avatar normalizers', () => {
    const allContractKeys: BodyShapeKey[] = [
      'slim_lean',
      'skinny_fat',
      'standard_balanced',
      'upper_developed',
      'lower_developed',
      'athletic_muscular',
      'plus_curvy',
    ];
    for (const key of allContractKeys) {
      const canonical = normalizeBodyShapeKey(key);
      assert.ok(canonical !== null, `normalizeBodyShapeKey(${key}) should not return null`);
      const avatarKey = normalizeBodyShape(key);
      assert.equal(typeof avatarKey, 'string');
    }
  });
});
