import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-rbac-site-demo-test-'));
const isolatedDbPath = path.join(tmpDir, 'test-rbac.db');
process.env.AINVENTORY_DB_PATH = isolatedDbPath;
delete process.env.SITE_DEMO_PASSWORD;

const [{ default: express }, { createApiRouter }, { createVtonRouter }, dbMod] = await Promise.all([
  import('express'),
  import('../../server/api.js'),
  import('../../server/vtonRouter.js'),
  import('../../server/db.js'),
]);

describe('RBAC Permission Management & site_demo Account Security', () => {
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']> | null = null;
  let adminToken = '';
  let siteDemoToken = '';

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

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminBody = (await adminLoginRes.json()) as {
      token?: string;
      user?: { role?: string; permissions?: string[] };
    };
    adminToken = String(adminBody.token || '');
    assert.ok(adminToken.length > 10);
    assert.equal(adminBody.user?.role, 'admin');
    assert.ok(adminBody.user?.permissions?.includes('admin:manage_roles'));
  });

  after(async () => {
    delete process.env.SITE_DEMO_PASSWORD;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    if (typeof (dbMod as Record<string, unknown>).closeAndFlushDatabase === 'function') {
      (dbMod as { closeAndFlushDatabase: () => void }).closeAndFlushDatabase();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps direct password login locked when SITE_DEMO_PASSWORD secret is unset, and authenticates via POST /api/auth/site-demo', async () => {
    const lockedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'site_demo', password: 'any-wrong-password' }),
    });
    assert.equal(lockedRes.status, 401);

    const demoRes = await fetch(`${baseUrl}/api/auth/site-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embed: true }),
    });
    assert.equal(demoRes.status, 200);
    assert.equal(demoRes.headers.get('set-cookie'), null);

    const demoBody = (await demoRes.json()) as {
      token?: string;
      user?: {
        username?: string;
        role?: string;
        isSiteDemo?: boolean;
        defaultCloset?: string;
        permissions?: string[];
        roleMeta?: { code?: string; nameKo?: string };
      };
    };
    siteDemoToken = String(demoBody.token || '');
    assert.ok(siteDemoToken.length > 10);
    assert.equal(demoBody.user?.username, 'site_demo');
    assert.equal(demoBody.user?.role, 'site_demo');
    assert.equal(demoBody.user?.isSiteDemo, true);
    assert.equal(demoBody.user?.defaultCloset, 'sample');
    assert.equal(demoBody.user?.roleMeta?.code, 'site_demo');
    assert.ok(demoBody.user?.permissions?.includes('closet:read_sample'));
    assert.equal(demoBody.user?.permissions?.includes('closet:write'), false);
    assert.equal(demoBody.user?.permissions?.includes('vton:synthesize'), false);
  });

  it('verifies direct password login for site_demo strictly against process.env.SITE_DEMO_PASSWORD secret', async () => {
    const ephemeralSecret = `demo-${crypto.randomBytes(12).toString('hex')}`;
    process.env.SITE_DEMO_PASSWORD = ephemeralSecret;
    (dbMod as { ensureSiteDemoAccount: () => unknown }).ensureSiteDemoAccount();

    const wrongRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'site_demo', password: 'wrong-password' }),
    });
    assert.equal(wrongRes.status, 401);

    const okRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'site_demo', password: ephemeralSecret }),
    });
    assert.equal(okRes.status, 200);
    const okBody = (await okRes.json()) as { user?: { username?: string; role?: string } };
    assert.equal(okBody.user?.username, 'site_demo');
    assert.equal(okBody.user?.role, 'site_demo');
  });

  it('allows sample closet reads for site_demo while blocking personal closets, mutations, paid AI, and account deletion with HTTP 403', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${siteDemoToken}`,
    };

    const sampleRes = await fetch(`${baseUrl}/api/garments?closet=sample`, {
      headers: authHeaders,
    });
    assert.equal(sampleRes.status, 200);
    const sampleBody = (await sampleRes.json()) as { garments?: unknown[] };
    assert.ok(Array.isArray(sampleBody.garments) && sampleBody.garments.length > 0);

    const otherClosetRes = await fetch(`${baseUrl}/api/garments?closet=husband`, {
      headers: authHeaders,
    });
    assert.equal(otherClosetRes.status, 403);

    const createGarmentRes = await fetch(`${baseUrl}/api/garments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        closet_owner: 'sample',
        name: 'Blocked Test Shirt',
        category: 'top',
      }),
    });
    assert.equal(createGarmentRes.status, 403);
    const createBody = (await createGarmentRes.json()) as { code?: string };
    assert.equal(createBody.code, 'PERMISSION_DENIED');

    const saveOutfitRes = await fetch(`${baseUrl}/api/outfits`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Blocked Outfit', item_ids: [1] }),
    });
    assert.equal(saveOutfitRes.status, 403);

    const visionRes = await fetch(`${baseUrl}/api/garments/vision-analyze`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ frontImageDataUrl: 'data:image/png;base64,AAAA' }),
    });
    assert.equal(visionRes.status, 403);

    const vtonRes = await fetch(`${baseUrl}/api/vton/synthesize`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ closet: 'sample', items: [] }),
    });
    assert.equal(vtonRes.status, 403);
    const vtonBody = (await vtonRes.json()) as { code?: string; requiredPermission?: string };
    assert.equal(vtonBody.code, 'PERMISSION_DENIED');
    assert.equal(vtonBody.requiredPermission, 'vton:synthesize');

    const mapsRes = await fetch(`${baseUrl}/api/maps/autocomplete`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ input: 'Seoul' }),
    });
    assert.equal(mapsRes.status, 403);

    const deleteAccountRes = await fetch(`${baseUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ confirmPermanentDelete: true }),
    });
    assert.equal(deleteAccountRes.status, 403);

    const adminRolesDenied = await fetch(`${baseUrl}/api/admin/roles`, {
      headers: authHeaders,
    });
    assert.equal(adminRolesDenied.status, 403);
  });

  it('allows admin to inspect RBAC roles/users, toggle role permissions, and update user role mappings', async () => {
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const listRes = await fetch(`${baseUrl}/api/admin/roles`, { headers: adminHeaders });
    assert.equal(listRes.status, 200);
    const overview = (await listRes.json()) as {
      roles: Array<{ code: string; permissions: string[] }>;
      permissions: Array<{ code: string }>;
      users: Array<{ id: number; username: string; role: string }>;
    };
    assert.ok(overview.roles.some((r) => r.code === 'site_demo'));
    const siteDemoUserRow = overview.users.find((u) => u.username === 'site_demo');
    assert.ok(siteDemoUserRow);
    assert.equal(siteDemoUserRow.role, 'site_demo');

    // Toggle shopping:analyze onto site_demo and verify live reflection, then restore
    const originalDemoRole = overview.roles.find((r) => r.code === 'site_demo')!;
    const updatedPerms = [...originalDemoRole.permissions, 'shopping:analyze'];
    const putPermRes = await fetch(`${baseUrl}/api/admin/roles/site_demo/permissions`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ permissions: updatedPerms }),
    });
    assert.equal(putPermRes.status, 200);
    const putPermBody = (await putPermRes.json()) as { permissions?: string[] };
    assert.ok(putPermBody.permissions?.includes('shopping:analyze'));

    // Restore original demo permissions
    const restoreRes = await fetch(`${baseUrl}/api/admin/roles/site_demo/permissions`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ permissions: originalDemoRole.permissions }),
    });
    assert.equal(restoreRes.status, 200);
  });

  it('blocks site_demo from changing password (403) and lets admin rotate password with full session invalidation', async () => {
    // 1) site_demo must be blocked (HTTP 403)
    const demoPwRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${siteDemoToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'any-password',
        newPassword: 'new-demo-password-123',
      }),
    });
    assert.equal(demoPwRes.status, 403);
    const demoPwBody = (await demoPwRes.json()) as { code?: string };
    assert.equal(demoPwBody.code, 'PERMISSION_DENIED');

    // 2) Wrong current password must return HTTP 401
    const wrongCurrentRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'wrong-current-password',
        newPassword: 'NewAdminPassword#2026',
      }),
    });
    assert.equal(wrongCurrentRes.status, 401);

    // 3) Valid admin password change rotates password and revokes old session
    const nextAdminPassword = `Admin-${crypto.randomBytes(6).toString('hex')}`;
    const oldAdminToken = adminToken;
    const changeRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldAdminToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'admin',
        newPassword: nextAdminPassword,
      }),
    });
    assert.equal(changeRes.status, 200);
    const changeBody = (await changeRes.json()) as { ok?: boolean; token?: string };
    assert.equal(changeBody.ok, true);
    assert.ok(changeBody.token && changeBody.token !== oldAdminToken);
    adminToken = String(changeBody.token);

    // 4) Previous session token must be invalidated immediately (HTTP 401)
    const revokedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldAdminToken}` },
    });
    assert.equal(revokedRes.status, 401);

    // 5) New session token must be valid (HTTP 200)
    const activeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(activeRes.status, 200);

    // 6) Old password fails login (401), new password succeeds (200)
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(oldLoginRes.status, 401);

    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: nextAdminPassword }),
    });
    assert.equal(newLoginRes.status, 200);
  });

  it('supports per-user menu and button permission overrides with reset and returns adminContactEmail on 403', async () => {
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };
    const demoHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${siteDemoToken}`,
    };

    const overviewRes = await fetch(`${baseUrl}/api/admin/roles`, { headers: adminHeaders });
    assert.equal(overviewRes.status, 200);
    const overview = (await overviewRes.json()) as {
      adminContactEmail?: string;
      users: Array<{ id: number; username: string; effectivePermissions: string[] }>;
    };
    assert.ok(overview.adminContactEmail && overview.adminContactEmail.includes('@'));
    const siteDemoRow = overview.users.find((u) => u.username === 'site_demo')!;
    assert.ok(siteDemoRow);
    assert.ok(siteDemoRow.effectivePermissions.includes('menu:calendar'));

    // Non-admin cannot modify per-user permissions (403 includes adminContactEmail)
    const deniedPut = await fetch(`${baseUrl}/api/admin/users/${siteDemoRow.id}/permissions`, {
      method: 'PUT',
      headers: demoHeaders,
      body: JSON.stringify({ overrides: { 'menu:calendar': 'deny' } }),
    });
    assert.equal(deniedPut.status, 403);
    const deniedPutBody = (await deniedPut.json()) as {
      code?: string;
      adminContactEmail?: string;
    };
    assert.equal(deniedPutBody.code, 'PERMISSION_DENIED');
    assert.ok(deniedPutBody.adminContactEmail && deniedPutBody.adminContactEmail.includes('@'));

    // Admin denies menu:calendar and grants btn:outfits:store for site_demo
    const putRes = await fetch(`${baseUrl}/api/admin/users/${siteDemoRow.id}/permissions`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        overrides: {
          'menu:calendar': 'deny',
          'btn:outfits:store': 'grant',
        },
      }),
    });
    assert.equal(putRes.status, 200);
    const putBody = (await putRes.json()) as {
      overrides?: Record<string, string>;
      permissions?: string[];
    };
    assert.equal(putBody.overrides?.['menu:calendar'], 'deny');
    assert.equal(putBody.overrides?.['btn:outfits:store'], 'grant');
    assert.equal(putBody.permissions?.includes('menu:calendar'), false);
    assert.equal(putBody.permissions?.includes('btn:outfits:store'), true);

    // /api/auth/me for site_demo immediately reflects overrides
    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: demoHeaders });
    assert.equal(meRes.status, 200);
    const meBody = (await meRes.json()) as {
      user?: { permissions?: string[]; adminContactEmail?: string };
    };
    assert.equal(meBody.user?.permissions?.includes('menu:calendar'), false);
    assert.equal(meBody.user?.permissions?.includes('btn:outfits:store'), true);
    assert.ok(meBody.user?.adminContactEmail && meBody.user.adminContactEmail.includes('@'));

    // Reset overrides back to role defaults
    const resetRes = await fetch(`${baseUrl}/api/admin/users/${siteDemoRow.id}/permissions`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert.equal(resetRes.status, 200);
    const resetBody = (await resetRes.json()) as {
      overrides?: Record<string, string>;
      permissions?: string[];
    };
    assert.deepEqual(resetBody.overrides, {});
    assert.equal(resetBody.permissions?.includes('menu:calendar'), true);
    assert.equal(resetBody.permissions?.includes('btn:outfits:store'), false);
  });

  it('seeds matching cyber-noir real-closet items (2 black pleated mini skirts, 2 sheer stockings, 2 chunky lace-up combat boots, moto jacket, choker)', async () => {
    const res = await fetch(`${baseUrl}/api/garments?closet=sample`, {
      headers: { Authorization: `Bearer ${siteDemoToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      garments?: Array<{ name?: string; category?: string; image_url?: string }>;
    };
    const names = (body.garments || []).map((g) => String(g.name || ''));
    const urls = (body.garments || []).map((g) => String(g.image_url || ''));
    assert.ok(names.includes('블랙 버클 벨티드 플리츠 미니 스커트'));
    assert.ok(names.includes('블랙 플리츠 미니 스커트'));
    assert.ok(names.includes('블랙 시어 싸이하이 스타킹'));
    assert.ok(names.includes('블랙 시어 더블밴드 오버니 스타킹'));
    assert.ok(names.includes('블랙 크롭 레더 모토 라이더 자켓'));
    assert.ok(names.includes('블랙 청키 러그솔 레이스업 컴뱃 부츠'));
    assert.ok(names.includes('블랙 플랫폼 레이스업 미드카프 워커 부츠'));
    assert.ok(names.includes('925 실버 레이어드 체인 초커 목걸이'));
    assert.ok(urls.includes('/seed/cyber-black-belted-pleated-skirt.webp'));
    assert.ok(urls.includes('/seed/cyber-black-overknee-stockings.webp'));
    assert.ok(urls.includes('/seed/cyber-black-platform-walker-boots.webp'));
  });
});
