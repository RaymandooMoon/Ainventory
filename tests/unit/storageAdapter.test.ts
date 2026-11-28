import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  createStorageAdapter,
  inferUploadContentType,
  isValidUploadFilename,
} from '../../server/storageAdapter.js';

describe('server/storageAdapter.js — Local Disk & GCS 3-Zone Adapter', () => {
  it('validates upload filenames strictly against path traversal and unsupported extensions', () => {
    assert.equal(isValidUploadFilename('closet_user1-1700000000.webp'), true);
    assert.equal(isValidUploadFilename('sample-item_01.jpg'), true);
    assert.equal(isValidUploadFilename('../secret.webp'), false);
    assert.equal(isValidUploadFilename('nested/file.webp'), false);
    assert.equal(isValidUploadFilename('evil.svg'), false);
    assert.equal(inferUploadContentType('a.webp'), 'image/webp');
    assert.equal(inferUploadContentType('a.png'), 'image/png');
    assert.equal(inferUploadContentType('a.jpg'), 'image/jpeg');
  });

  it('persists, reads, signs, and deletes uploads and VTON cache in local mode', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainv-storage-'));
    const uploadsDir = path.join(tmpDir, 'uploads');
    const vtonCacheDir = path.join(tmpDir, 'vton-cache');
    const storage = createStorageAdapter({
      uploadsDir,
      vtonCacheDir,
      privateBucket: '',
      scratchBucket: '',
    });

    try {
      assert.equal(storage.mode, 'local');
      const payload = Buffer.from('RIFF....WEBP', 'utf8');
      const saved = await storage.putUpload('u1-coat.webp', payload, 'image/webp');
      assert.equal(saved.url, '/uploads/u1-coat.webp');

      const readBack = await storage.readUploadBuffer('u1-coat.webp');
      assert.ok(readBack);
      assert.equal(readBack.contentType, 'image/webp');
      assert.deepEqual(readBack.buffer, payload);

      const signed = await storage.getSignedUploadUrl('u1-coat.webp', 600);
      assert.equal(signed.url, '/uploads/u1-coat.webp');

      await storage.putVtonCache('closet_u1-front.json', Buffer.from('{}'));
      const purged = await storage.deleteVtonCacheByOwnerPrefix('closet_u1');
      assert.equal(purged, 1);

      const deleted = await storage.deleteUpload('u1-coat.webp');
      assert.equal(deleted, true);
      assert.equal(await storage.readUploadBuffer('u1-coat.webp'), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('stores Zone B private objects, clamps V4 Signed URLs to <= 900s, and purges Zone C prefix on GCS mock', async () => {
    const savedObjects = new Map<string, Buffer>();
    const signedRequests: Array<{ bucket: string; name: string; expires: number }> = [];

    const mockClient = {
      bucket(bucketName: string) {
        return {
          file(objectName: string) {
            const fullKey = `${bucketName}/${objectName}`;
            return {
              name: objectName,
              async save(buf: Buffer) {
                savedObjects.set(fullKey, Buffer.from(buf));
              },
              async exists() {
                return [savedObjects.has(fullKey)];
              },
              async download() {
                return [savedObjects.get(fullKey)];
              },
              async delete() {
                savedObjects.delete(fullKey);
              },
              async getSignedUrl(opts: { expires: number }) {
                signedRequests.push({ bucket: bucketName, name: objectName, expires: opts.expires });
                return [`https://storage.googleapis.com/${bucketName}/${objectName}?X-Goog-Signature=mock`];
              },
            };
          },
          async getFiles({ prefix }: { prefix: string }) {
            const files = [];
            for (const key of savedObjects.keys()) {
              if (key.startsWith(`${bucketName}/${prefix}`)) {
                const name = key.slice(bucketName.length + 1);
                files.push({
                  name,
                  async delete() {
                    savedObjects.delete(key);
                  },
                });
              }
            }
            return [files];
          },
        };
      },
    };

    const storage = createStorageAdapter({
      privateBucket: 'invtry-user-private',
      scratchBucket: 'invtry-vton-scratch',
      storageClient: mockClient,
    });

    assert.equal(storage.mode, 'gcs');
    await storage.putUpload('closet_g1-jacket.webp', Buffer.from('webp-bytes'), 'image/webp');
    assert.equal(savedObjects.has('invtry-user-private/uploads/closet_g1-jacket.webp'), true);

    const readBack = await storage.readUploadBuffer('closet_g1-jacket.webp');
    assert.equal(readBack?.buffer.toString('utf8'), 'webp-bytes');

    // Requesting 1 hour must clamp to 15 minutes (900s) max
    const signed = await storage.getSignedUploadUrl('closet_g1-jacket.webp', 3600);
    assert.equal(signed.expiresInSec, 900);
    assert.equal(signed.storage, 'gcs');
    assert.ok(signed.url.startsWith('https://storage.googleapis.com/invtry-user-private/uploads/closet_g1-jacket.webp'));
    assert.equal(signedRequests.length, 1);

    await storage.putVtonCache('closet_g1-sheet.png', Buffer.from('png'));
    const purged = await storage.deleteVtonCacheByOwnerPrefix('closet_g1');
    assert.equal(purged, 1);
    assert.equal(savedObjects.has('invtry-vton-scratch/vton-cache/closet_g1-sheet.png'), false);

    await storage.deleteUpload('closet_g1-jacket.webp');
    assert.equal(savedObjects.has('invtry-user-private/uploads/closet_g1-jacket.webp'), false);
  });
});
