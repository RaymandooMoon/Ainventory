import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  DEFAULT_MEGASCANS_BASE_URL,
  MEGASCANS_SLOT_IDS,
  MEGASCANS_SLOT_SPECS,
  buildMegascansSlotConfigPayload,
  canAccessAdminMegascansLab,
  classifyMegascansTextureRole,
  parseMegascansManifest,
  resolveFittingFloorSlotId,
  resolveMegascansAssetUrl,
  resolveMegascansBaseUrl,
  type MegascansSlotId,
} from '../../src/three/megascans/megascansCatalog.ts';
import {
  applyMegascansPbrToMaterial,
  createMegascansSession,
  ensureGeometryUv1ForAo,
  resetMegascansManifestCacheForTest,
} from '../../src/three/megascans/megascansMaterialLoader.ts';
import { STAGE_BACKGROUNDS } from '../../src/utils/stageBackgroundCatalog.ts';

function makeDummyTexture(name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

describe('Megascans catalog & floor preset mapping', () => {
  it('defines all 8 Ainventory 3D slots with valid defaults and Fab search keywords', () => {
    const expectedSlots: MegascansSlotId[] = [
      'showroom-pedestal',
      'specs-floor',
      'atelier-fabric',
      'fitting-floor-stone',
      'fitting-floor-oak',
      'fitting-floor-outdoor',
      'gacha-plinth',
      'gacha-metal',
    ];
    assert.deepEqual([...MEGASCANS_SLOT_IDS], expectedSlots);

    for (const slotId of MEGASCANS_SLOT_IDS) {
      const spec = MEGASCANS_SLOT_SPECS[slotId];
      assert.equal(spec.id, slotId);
      assert.ok(spec.fabKeywords.length >= 2, `${slotId} should have Fab search keywords`);
      assert.ok(spec.defaultRepeat[0] > 0 && spec.defaultRepeat[1] > 0);
      assert.ok(spec.defaultNormalStrength > 0 && spec.defaultNormalStrength <= 2);
      assert.ok(spec.labelKo.length > 0 && spec.labelEn.length > 0);
    }
  });

  it('maps every stage background in STAGE_BACKGROUNDS to stone, oak, or outdoor floor preset', () => {
    const oakIds = new Set([
      'c_oak_dressing_room',
      's_grand_paris_atelier',
      'b_minimal_loft_window',
    ]);

    for (const bg of STAGE_BACKGROUNDS) {
      const slot = resolveFittingFloorSlotId(bg.id, bg.isOutdoor);
      if (bg.isOutdoor) {
        assert.equal(slot, 'fitting-floor-outdoor', `${bg.id} is outdoor`);
      } else if (oakIds.has(bg.id)) {
        assert.equal(slot, 'fitting-floor-oak', `${bg.id} should map to oak parquet`);
      } else {
        assert.equal(slot, 'fitting-floor-stone', `${bg.id} should map to indoor stone`);
      }
    }

    assert.equal(resolveFittingFloorSlotId(undefined, false), 'fitting-floor-stone');
    assert.equal(resolveFittingFloorSlotId(undefined, true), 'fitting-floor-outdoor');
  });
});

describe('Megascans filename role classifier', () => {
  it('recognizes standard Quixel / Fab PBR texture names and DirectX vs OpenGL normals', () => {
    assert.deepEqual(classifyMegascansTextureRole('ujbhcdycw_2K_Albedo.jpg'), {
      role: 'albedo',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Marble_BaseColor_2K.png'), {
      role: 'albedo',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Stone_2K_Normal_LOD0.jpg'), {
      role: 'normal',
      normalConvention: 'opengl',
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Stone_2K_NormalDX.png'), {
      role: 'normal',
      normalConvention: 'directx',
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Stone_2K_NormalGL.png'), {
      role: 'normal',
      normalConvention: 'opengl',
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Fabric_2K_ORM.png'), {
      role: 'orm',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Fabric_2K_ORDp.jpg'), {
      role: 'ordp',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Fabric_2K_Roughness.jpg'), {
      role: 'roughness',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Metal_2K_Gloss.jpg'), {
      role: 'roughness',
      normalConvention: null,
      isGloss: true,
    });
    assert.deepEqual(classifyMegascansTextureRole('Stone_2K_AO.jpg'), {
      role: 'ao',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Brass_2K_Metalness.png'), {
      role: 'metalness',
      normalConvention: null,
      isGloss: false,
    });
    assert.deepEqual(classifyMegascansTextureRole('Stone_2K_Displacement.exr'), {
      role: 'displacement',
      normalConvention: null,
      isGloss: false,
    });
  });

  it('ignores non-texture previews, thumbnails, and metadata files', () => {
    assert.equal(classifyMegascansTextureRole('preview_thumbnail.jpg'), null);
    assert.equal(classifyMegascansTextureRole('README.txt'), null);
    assert.equal(classifyMegascansTextureRole('asset.json'), null);
  });
});

describe('Megascans manifest validation & URL safety', () => {
  it('parses a valid v1 manifest and rejects invalid or traversal paths', () => {
    const valid = parseMegascansManifest({
      version: 1,
      generatedAt: '2026-11-25T00:00:00Z',
      slots: {
        'showroom-pedestal': {
          assetName: 'Obsidian Marble',
          license: 'Fab Standard License',
          normalConvention: 'opengl',
          repeat: [2, 2],
          normalStrength: 0.75,
          tiers: {
            desktop: {
              size: 1024,
              albedo: 'showroom-pedestal/desktop/albedo.webp',
              normal: 'showroom-pedestal/desktop/normal.webp',
              orm: 'showroom-pedestal/desktop/orm.webp',
            },
            mobile: {
              size: 512,
              albedo: 'showroom-pedestal/mobile/albedo.webp',
              normal: 'showroom-pedestal/mobile/normal.webp',
              orm: 'showroom-pedestal/mobile/orm.webp',
            },
          },
        },
        'malicious-slot': {
          assetName: 'Ignored Unknown Slot',
          tiers: {
            desktop: { size: 1024, albedo: 'evil/albedo.webp' },
          },
        },
      },
    });

    assert.ok(valid);
    assert.equal(valid.version, 1);
    assert.ok(valid.slots['showroom-pedestal']);
    assert.equal(
      valid.slots['showroom-pedestal']?.tiers.desktop?.orm,
      'showroom-pedestal/desktop/orm.webp'
    );
    assert.equal(Object.keys(valid.slots).length, 1);

    // Reject path traversal & javascript: URIs inside a slot
    const unsafe = parseMegascansManifest({
      version: 1,
      generatedAt: '2026-11-25T00:00:00Z',
      slots: {
        'specs-floor': {
          assetName: 'Bad',
          tiers: {
            desktop: {
              size: 1024,
              albedo: '../secrets/albedo.webp',
              normal: 'javascript:alert(1)',
            },
          },
        },
      },
    });
    assert.ok(unsafe);
    assert.equal(unsafe.slots['specs-floor'], undefined);

    assert.equal(parseMegascansManifest(null), null);
    assert.equal(parseMegascansManifest({ version: 99, slots: {} }), null);
  });

  it('resolves base URLs and relative asset paths safely', () => {
    assert.equal(resolveMegascansBaseUrl(undefined), DEFAULT_MEGASCANS_BASE_URL);
    assert.equal(resolveMegascansBaseUrl('  '), DEFAULT_MEGASCANS_BASE_URL);
    assert.equal(
      resolveMegascansBaseUrl('https://cdn.ainvtry.com/megascans/'),
      'https://cdn.ainvtry.com/megascans'
    );
    assert.equal(
      resolveMegascansBaseUrl('javascript:alert(1)'),
      DEFAULT_MEGASCANS_BASE_URL
    );

    assert.equal(
      resolveMegascansAssetUrl('specs-floor/desktop/orm.webp', '/assets/megascans'),
      '/assets/megascans/specs-floor/desktop/orm.webp'
    );
    assert.equal(
      resolveMegascansAssetUrl(
        'specs-floor/desktop/orm.webp',
        'https://cdn.ainvtry.com/megascans'
      ),
      'https://cdn.ainvtry.com/megascans/specs-floor/desktop/orm.webp'
    );
    assert.throws(() => resolveMegascansAssetUrl('../etc/passwd', '/assets/megascans'));
  });
});

describe('Three.js Megascans PBR material application & UV1 AO safety', () => {
  it('duplicates uv into uv1 for geometries lacking uv1 and preserves existing uv1', () => {
    const plane = new THREE.PlaneGeometry(2, 2);
    assert.equal(plane.getAttribute('uv1'), undefined);
    assert.equal(ensureGeometryUv1ForAo(plane), true);
    assert.equal(plane.getAttribute('uv1'), plane.getAttribute('uv'));

    const customUv1 = new THREE.BufferAttribute(new Float32Array(8), 2);
    plane.setAttribute('uv1', customUv1);
    assert.equal(ensureGeometryUv1ForAo(plane), false);
    assert.equal(plane.getAttribute('uv1'), customUv1);
    plane.dispose();
  });

  it('applies PBR textures with proper colorSpaces, DirectX Y-flip, ORM mapping, and alphaMap preservation', () => {
    const alphaTex = makeDummyTexture('alpha');
    const oldBump = makeDummyTexture('old-bump');
    const origAlbedo = makeDummyTexture('orig-albedo');
    const mat = new THREE.MeshStandardMaterial({
      map: origAlbedo,
      bumpMap: oldBump,
      alphaMap: alphaTex,
      roughness: 0.72,
      metalness: 0.14,
    });

    const msAlbedo = makeDummyTexture('ms-albedo');
    const msNormal = makeDummyTexture('ms-normal');
    const msOrm = makeDummyTexture('ms-orm');

    // Case 1: preserveOriginalAlbedo = true (e.g., couture coat / avatar suit micro-weave)
    applyMegascansPbrToMaterial(
      mat,
      { albedo: msAlbedo, normal: msNormal, orm: msOrm },
      {
        slotId: 'atelier-fabric',
        repeat: [4, 4],
        normalStrength: 0.65,
        normalConvention: 'directx',
        preserveOriginalAlbedo: true,
        aoMapIntensity: 0.55,
      }
    );

    assert.equal(mat.map, origAlbedo, 'original garment albedo must be preserved');
    assert.equal(mat.alphaMap, alphaTex, 'alphaMap must never be overwritten');
    assert.equal(mat.bumpMap, null, 'procedural bumpMap should be cleared when normalMap is set');
    assert.equal(mat.normalMap, msNormal);
    assert.equal(msNormal.colorSpace, THREE.NoColorSpace);
    assert.equal(mat.normalScale.x, 0.65);
    assert.equal(mat.normalScale.y, -0.65, 'DirectX normal must invert Y scale');
    assert.equal(mat.aoMap, msOrm);
    assert.equal(mat.roughnessMap, msOrm);
    assert.equal(mat.metalnessMap, msOrm);
    assert.equal(msOrm.colorSpace, THREE.NoColorSpace);
    assert.equal(msOrm.repeat.x, 4);
    assert.equal(mat.userData.megascansSlotId, 'atelier-fabric');

    // Case 2: preserveOriginalAlbedo = false (e.g., marble pedestal / stone plinth)
    applyMegascansPbrToMaterial(
      mat,
      { albedo: msAlbedo, normal: msNormal, orm: msOrm },
      {
        slotId: 'showroom-pedestal',
        repeat: [2, 2],
        normalStrength: 0.8,
        normalConvention: 'opengl',
        preserveOriginalAlbedo: false,
      }
    );

    assert.equal(mat.map, msAlbedo);
    assert.equal(msAlbedo.colorSpace, THREE.SRGBColorSpace);
    assert.equal(mat.normalScale.y, 0.8, 'OpenGL normal must keep positive Y scale');

    // Case 3: preserveExistingNormalMap = true protects pre-baked GLB garment normal maps
    const bakedNormal = makeDummyTexture('baked-garment-normal');
    const glbMat = new THREE.MeshStandardMaterial({ normalMap: bakedNormal });
    applyMegascansPbrToMaterial(
      glbMat,
      { albedo: msAlbedo, normal: msNormal, orm: msOrm },
      {
        slotId: 'atelier-fabric',
        preserveOriginalAlbedo: true,
        preserveExistingNormalMap: true,
      }
    );
    assert.equal(glbMat.normalMap, bakedNormal, 'pre-baked GLB normal map must stay intact');
    assert.equal(glbMat.roughnessMap, msOrm, 'ORM roughness map should still attach');
    bakedNormal.dispose();
    glbMat.dispose();

    alphaTex.dispose();
    oldBump.dispose();
    origAlbedo.dispose();
    msAlbedo.dispose();
    msNormal.dispose();
    msOrm.dispose();
    mat.dispose();
  });

  it('bypasses all network loading on software WebGL and disposes cleanly', async () => {
    resetMegascansManifestCacheForTest();
    let fetchCalls = 0;
    const session = createMegascansSession({
      isSoftwareGl: true,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('{}', { status: 200 });
      },
    });

    const result = await session.loadSlot('showroom-pedestal');
    assert.equal(result, null);
    assert.equal(fetchCalls, 0);
    session.dispose();
  });
});

describe('scripts/sync-megascans.py end-to-end WebP & ORM packing pipeline', () => {
  it('optimizes raw inbox folders and Fab ZIP archives into desktop/mobile WebP + ORM + valid manifest', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ainventory-megascans-'));
    try {
      const inboxDir = path.join(tmpRoot, 'inbox');
      const outDir = path.join(tmpRoot, 'out');
      const pedestalDir = path.join(inboxDir, 'showroom-pedestal');
      const fabricDir = path.join(inboxDir, 'atelier-fabric');
      fs.mkdirSync(pedestalDir, { recursive: true });
      fs.mkdirSync(fabricDir, { recursive: true });

      // Generate synthetic Megascans PNGs + a Fab-style ZIP archive using Python Pillow
      const fixtureScript = `
import io, os, zipfile
from PIL import Image

pedestal_dir = ${JSON.stringify(pedestalDir)}
fabric_dir = ${JSON.stringify(fabricDir)}

# 1. Raw folder with separate Albedo, NormalDX, AO, Roughness, Metalness
Image.new('RGB', (128, 128), (40, 42, 48)).save(os.path.join(pedestal_dir, 'Obsidian_Marble_2K_Albedo.png'))
# DirectX Normal with G=60 -> inverted to OpenGL G=195
Image.new('RGB', (128, 128), (128, 60, 255)).save(os.path.join(pedestal_dir, 'Obsidian_Marble_2K_NormalDX.png'))
Image.new('L', (128, 128), 210).save(os.path.join(pedestal_dir, 'Obsidian_Marble_2K_AO.png'))
Image.new('L', (128, 128), 90).save(os.path.join(pedestal_dir, 'Obsidian_Marble_2K_Roughness.png'))
Image.new('L', (128, 128), 16).save(os.path.join(pedestal_dir, 'Obsidian_Marble_2K_Metalness.png'))

# 2. Fab ZIP archive with Gloss (inverted to Roughness) + NormalGL
zip_path = os.path.join(fabric_dir, 'Tailored_Wool_2K.zip')
with zipfile.ZipFile(zip_path, 'w') as zf:
    for fname, mode, color in [
        ('nested/Wool_2K_BaseColor.png', 'RGB', (96, 92, 86)),
        ('nested/Wool_2K_NormalGL.png', 'RGB', (128, 140, 255)),
        ('nested/Wool_2K_Gloss.png', 'L', 40),
        ('nested/Wool_2K_AO.png', 'L', 230),
    ]:
        buf = io.BytesIO()
        Image.new(mode, (64, 64), color).save(buf, format='PNG')
        zf.writestr(fname, buf.getvalue())
`;
      execFileSync('python3', ['-c', fixtureScript], { stdio: 'pipe' });

      execFileSync(
        'python3',
        [
          'scripts/sync-megascans.py',
          '--inbox',
          inboxDir,
          '--out',
          outDir,
          '--desktop-size',
          '128',
          '--mobile-size',
          '64',
        ],
        { cwd: process.cwd(), stdio: 'pipe' }
      );

      const manifestPath = path.join(outDir, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json should be generated');

      const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
      const parsed = parseMegascansManifest(rawManifest);
      assert.ok(parsed, 'generated manifest must satisfy strict runtime schema');

      const pedestalSlot = parsed.slots['showroom-pedestal'];
      assert.ok(pedestalSlot);
      assert.equal(pedestalSlot.normalConvention, 'opengl', 'DX normal should be converted to OpenGL');
      assert.ok(pedestalSlot.tiers.desktop?.albedo);
      assert.ok(pedestalSlot.tiers.desktop?.normal);
      assert.ok(pedestalSlot.tiers.desktop?.orm);
      assert.ok(pedestalSlot.tiers.mobile?.orm);

      const fabricSlot = parsed.slots['atelier-fabric'];
      assert.ok(fabricSlot);
      assert.ok(fabricSlot.tiers.desktop?.normal);
      assert.ok(fabricSlot.tiers.desktop?.orm);

      // Verify pixel dimensions, ORM channel math, and DX->GL normal G-channel flip
      const inspectScript = `
import json, os
from PIL import Image

out_dir = ${JSON.stringify(outDir)}
ped_norm = Image.open(os.path.join(out_dir, 'showroom-pedestal/desktop/normal.webp')).convert('RGB')
ped_orm = Image.open(os.path.join(out_dir, 'showroom-pedestal/desktop/orm.webp')).convert('RGB')
ped_mob = Image.open(os.path.join(out_dir, 'showroom-pedestal/mobile/orm.webp')).convert('RGB')
fab_orm = Image.open(os.path.join(out_dir, 'atelier-fabric/desktop/orm.webp')).convert('RGB')

print(json.dumps({
    'ped_norm_size': list(ped_norm.size),
    'ped_norm_px': list(ped_norm.getpixel((64, 64))),
    'ped_orm_px': list(ped_orm.getpixel((64, 64))),
    'ped_mob_size': list(ped_mob.size),
    'fab_orm_px': list(fab_orm.getpixel((32, 32))),
}))
`;
      const inspected = JSON.parse(
        execFileSync('python3', ['-c', inspectScript], { encoding: 'utf8' })
      ) as {
        ped_norm_size: [number, number];
        ped_norm_px: [number, number, number];
        ped_orm_px: [number, number, number];
        ped_mob_size: [number, number];
        fab_orm_px: [number, number, number];
      };

      assert.deepEqual(inspected.ped_norm_size, [128, 128]);
      assert.deepEqual(inspected.ped_mob_size, [64, 64]);
      // NormalDX G=60 inverted to OpenGL G=195 (±6 tolerance for lossy/near-lossless WebP)
      assert.ok(
        Math.abs(inspected.ped_norm_px[1] - 195) <= 6,
        `expected inverted OpenGL normal G≈195, got ${inspected.ped_norm_px[1]}`
      );
      // ORM: R=AO(210), G=Roughness(90), B=Metalness(16)
      assert.ok(Math.abs(inspected.ped_orm_px[0] - 210) <= 6);
      assert.ok(Math.abs(inspected.ped_orm_px[1] - 90) <= 6);
      assert.ok(Math.abs(inspected.ped_orm_px[2] - 16) <= 6);
      // Fabric Gloss=40 -> Roughness = 255 - 40 = 215
      assert.ok(Math.abs(inspected.fab_orm_px[0] - 230) <= 6);
      assert.ok(Math.abs(inspected.fab_orm_px[1] - 215) <= 6);
      assert.ok(inspected.fab_orm_px[2] <= 6);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('Admin Settings Megascans 3D Lab RBAC guard & slot config export', () => {
  it('grants Settings 3D Lab access strictly to authenticated admin accounts', () => {
    assert.equal(canAccessAdminMegascansLab(null), false);
    assert.equal(canAccessAdminMegascansLab(undefined), false);
    assert.equal(canAccessAdminMegascansLab({ role: 'member', username: 'alice' }), false);
    assert.equal(
      canAccessAdminMegascansLab({ role: 'site_demo', username: 'site_demo', isSampleDemo: true }),
      false
    );
    assert.equal(
      canAccessAdminMegascansLab({ role: 'admin', username: 'admin', isSampleDemo: true }),
      false,
      'sample demo mode must never receive admin lab access'
    );
    assert.equal(canAccessAdminMegascansLab({ role: 'admin', username: 'owner' }), true);
    assert.equal(canAccessAdminMegascansLab({ role: 'member', username: 'admin' }), true);
    assert.equal(
      canAccessAdminMegascansLab({
        role: 'ops',
        username: 'ops_user',
        permissions: ['admin:manage_roles'],
      }),
      true
    );
  });

  it('clamps and serializes slot.config.json export payloads cleanly', () => {
    const payload = buildMegascansSlotConfigPayload({
      assetName: '  Obsidian Marble 2K  ',
      repeat: 2.456,
      normalStrength: 99,
      aoMapIntensity: -0.5,
      flipNormalY: true,
      preserveOriginalAlbedo: false,
    });

    assert.deepEqual(payload, {
      assetName: 'Obsidian Marble 2K',
      license: 'Fab Standard License',
      repeat: [2.46, 2.46],
      normalStrength: 3,
      aoMapIntensity: 0,
      flipNormalY: true,
      preserveOriginalAlbedo: false,
    });
  });
});
