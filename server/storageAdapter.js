import fs from 'node:fs';
import path from 'node:path';

const SAFE_UPLOAD_FILENAME_RE = /^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/;
const SAFE_CACHE_KEY_RE = /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/;
const MAX_SIGNED_URL_TTL_SEC = 15 * 60; // 15 minutes max per ARCHITECTURE_SECURITY.md

export function isValidUploadFilename(filename) {
  if (typeof filename !== 'string') return false;
  const clean = filename.trim();
  if (!clean || clean.length > 180 || clean.includes('..')) return false;
  if (path.basename(clean) !== clean) return false;
  return SAFE_UPLOAD_FILENAME_RE.test(clean);
}

export function inferUploadContentType(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function normalizeCacheKey(rawKey) {
  const clean = String(rawKey || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!clean || clean.includes('..') || !SAFE_CACHE_KEY_RE.test(clean)) {
    return null;
  }
  return clean;
}

/**
 * Storage abstraction supporting:
 * - Local filesystem (dev/CI/tests: `data/uploads`, `data/vton-cache`)
 * - Google Cloud Storage 3-Zone Private/Scratch buckets (Cloud Run Seoul `asia-northeast3`):
 *     - Zone B (`GCS_PRIVATE_BUCKET`): User garment uploads (`uploads/<owner>-...webp`),
 *       Public Access Prevention enforced + <=15-minute V4 Signed URLs.
 *     - Zone C (`GCS_SCRATCH_BUCKET`): Ephemeral VTON cache (`vton-cache/...`),
 *       24h Object Lifecycle auto-deletion + immediate purge on account deletion.
 * @param {{ uploadsDir?: string; vtonCacheDir?: string; privateBucket?: string; scratchBucket?: string; storageClient?: any }} [options]
 */
export function createStorageAdapter({
  uploadsDir = '',
  vtonCacheDir = '',
  privateBucket = process.env.GCS_PRIVATE_BUCKET || '',
  scratchBucket = process.env.GCS_SCRATCH_BUCKET || '',
  storageClient = null,
} = {}) {
  const cleanPrivateBucket = String(privateBucket || '').trim();
  const cleanScratchBucket = String(scratchBucket || '').trim();
  const isGcsMode = Boolean(cleanPrivateBucket);

  let lazyStoragePromise = null;
  const getStorageClient = async () => {
    if (storageClient) return storageClient;
    if (!lazyStoragePromise) {
      lazyStoragePromise = import('@google-cloud/storage').then((mod) => {
        const StorageCtor = mod.Storage || mod.default?.Storage;
        return new StorageCtor();
      });
    }
    return lazyStoragePromise;
  };

  const resolveLocalUploadPath = (filename) => {
    if (!isValidUploadFilename(filename)) {
      throw new Error('Invalid upload filename');
    }
    const root = path.resolve(uploadsDir);
    const full = path.resolve(root, filename);
    if (!full.startsWith(`${root}${path.sep}`)) {
      throw new Error('Upload path traversal blocked');
    }
    return full;
  };

  return {
    mode: isGcsMode ? 'gcs' : 'local',
    privateBucket: cleanPrivateBucket || null,
    scratchBucket: cleanScratchBucket || null,

    async putUpload(filename, buffer, contentType = inferUploadContentType(filename)) {
      if (!isValidUploadFilename(filename)) {
        throw new Error('Invalid upload filename');
      }
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Empty upload buffer');
      }

      if (isGcsMode) {
        const client = await getStorageClient();
        const file = client.bucket(cleanPrivateBucket).file(`uploads/${filename}`);
        await file.save(buffer, {
          resumable: false,
          contentType,
          metadata: {
            cacheControl: 'private, max-age=300',
            contentDisposition: 'inline',
          },
        });
        return { url: `/uploads/${filename}`, storage: 'gcs', key: `uploads/${filename}` };
      }

      fs.mkdirSync(uploadsDir, { recursive: true });
      const targetPath = resolveLocalUploadPath(filename);
      fs.writeFileSync(targetPath, buffer);
      return { url: `/uploads/${filename}`, storage: 'local', key: targetPath };
    },

    async readUploadBuffer(filename) {
      if (!isValidUploadFilename(filename)) return null;

      if (isGcsMode) {
        try {
          const client = await getStorageClient();
          const file = client.bucket(cleanPrivateBucket).file(`uploads/${filename}`);
          const [exists] = await file.exists();
          if (!exists) return null;
          const [buf] = await file.download();
          return {
            buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
            contentType: inferUploadContentType(filename),
          };
        } catch (err) {
          if (err?.code === 404) return null;
          throw err;
        }
      }

      const full = resolveLocalUploadPath(filename);
      if (!fs.existsSync(full)) return null;
      return {
        buffer: fs.readFileSync(full),
        contentType: inferUploadContentType(filename),
      };
    },

    async deleteUpload(filename) {
      if (!isValidUploadFilename(filename)) return false;

      if (isGcsMode) {
        try {
          const client = await getStorageClient();
          await client
            .bucket(cleanPrivateBucket)
            .file(`uploads/${filename}`)
            .delete({ ignoreNotFound: true });
          return true;
        } catch (err) {
          if (err?.code === 404) return false;
          throw err;
        }
      }

      const full = resolveLocalUploadPath(filename);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        return true;
      }
      return false;
    },

    async getSignedUploadUrl(filename, ttlSeconds = MAX_SIGNED_URL_TTL_SEC) {
      if (!isValidUploadFilename(filename)) {
        throw new Error('Invalid upload filename');
      }
      const clampedTtl = Math.max(60, Math.min(MAX_SIGNED_URL_TTL_SEC, Number(ttlSeconds) || MAX_SIGNED_URL_TTL_SEC));

      if (isGcsMode) {
        const client = await getStorageClient();
        const file = client.bucket(cleanPrivateBucket).file(`uploads/${filename}`);
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + clampedTtl * 1000,
        });
        return { url: signedUrl, expiresInSec: clampedTtl, storage: 'gcs' };
      }

      return { url: `/uploads/${filename}`, expiresInSec: clampedTtl, storage: 'local' };
    },

    async putVtonCache(key, buffer, contentType = 'application/octet-stream') {
      const safeKey = normalizeCacheKey(key);
      if (!safeKey) throw new Error('Invalid VTON cache key');

      if (cleanScratchBucket) {
        const client = await getStorageClient();
        await client.bucket(cleanScratchBucket).file(`vton-cache/${safeKey}`).save(buffer, {
          resumable: false,
          contentType,
          metadata: { cacheControl: 'private, no-store' },
        });
        return true;
      }

      if (!vtonCacheDir) return false;
      const root = path.resolve(vtonCacheDir);
      const target = path.resolve(root, safeKey);
      if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error('VTON cache path traversal blocked');
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
      return true;
    },

    async deleteVtonCacheByOwnerPrefix(ownerPrefix) {
      const cleanPrefix = String(ownerPrefix || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!cleanPrefix) return 0;

      let deletedCount = 0;

      if (cleanScratchBucket) {
        const client = await getStorageClient();
        const bucket = client.bucket(cleanScratchBucket);
        const [files] = await bucket.getFiles({ prefix: 'vton-cache/' });
        for (const file of files || []) {
          if (file.name.includes(cleanPrefix)) {
            await file.delete({ ignoreNotFound: true });
            deletedCount += 1;
          }
        }
      }

      if (vtonCacheDir && fs.existsSync(vtonCacheDir)) {
        const cacheRoot = path.resolve(vtonCacheDir);
        for (const entry of fs.readdirSync(cacheRoot)) {
          if (!entry.includes(cleanPrefix)) continue;
          const target = path.resolve(cacheRoot, entry);
          if (target.startsWith(`${cacheRoot}${path.sep}`)) {
            fs.rmSync(target, { recursive: true, force: true });
            deletedCount += 1;
          }
        }
      }

      return deletedCount;
    },
  };
}
