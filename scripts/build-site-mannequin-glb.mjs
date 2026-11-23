#!/usr/bin/env node
/**
 * build-site-mannequin-glb.mjs
 * ---------------------------------------------------------------------------
 * Builds an optimized, 20-bone skinned, vertex-AO-baked luxury fashion
 * mannequin GLB (`site/public/assets/models/studio-mannequin-v1.glb`) from
 * Ainventory's CC0 MakeHuman base + tailored garment library in
 * `public/models/mannequin/`.
 *
 * Output primitives (sharing ONE 20-bone anatomical skin):
 *   - mannequin_body   (culled head, neck, hands — zero garment poke-through)
 *   - mannequin_hair   (conformal sculpted swept-back editorial hair cap)
 *   - garment_coat     (tailored double-breasted knee-length wool overcoat)
 *   - garment_knit     (inner merino turtleneck/crewneck visible at V-lapel)
 *   - garment_slacks   (tailored straight wool slacks)
 *   - garment_shoes    (sleek Chelsea ankle boots — zero ankle gap)
 *
 * Usage:
 *   node scripts/build-site-mannequin-glb.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MANNEQUIN_DIR = path.join(REPO_ROOT, 'public/models/mannequin');
const OUT_FILE = path.join(REPO_ROOT, 'site/public/assets/models/studio-mannequin-v1.glb');

/* ==========================================================================
 * 1. Editorial Morph Recipe (Identical Across Body & All Garments)
 * ========================================================================== */

const EDITORIAL_MORPHS = {
  gender_male: 0.92,
  shoulder_up: 0.22,
  chest_up: 0.08,
  waist_down: 0.14,
  belly_down: 0.08,
  muscle_up: 0.14,
};

/* ==========================================================================
 * 2. 20-Bone Anatomical Skeleton Hierarchy (From manifest.json)
 * ========================================================================== */

const BONE_SPECS = [
  { name: 'pelvis', parent: -1 },
  { name: 'spine3', parent: 0 },
  { name: 'spine2', parent: 1 },
  { name: 'spine1', parent: 2 },
  { name: 'neck', parent: 3 },
  { name: 'head', parent: 4 },
  { name: 'clavicleL', parent: 3 },
  { name: 'shoulderL', parent: 6 },
  { name: 'elbowL', parent: 7 },
  { name: 'handL', parent: 8 },
  { name: 'clavicleR', parent: 3 },
  { name: 'shoulderR', parent: 10 },
  { name: 'elbowR', parent: 11 },
  { name: 'handR', parent: 12 },
  { name: 'hipL', parent: 0 },
  { name: 'kneeL', parent: 14 },
  { name: 'ankleL', parent: 15 },
  { name: 'hipR', parent: 0 },
  { name: 'kneeR', parent: 17 },
  { name: 'ankleR', parent: 18 },
];

const BONE_INDEX = Object.fromEntries(BONE_SPECS.map((b, i) => [b.name, i]));

/* ==========================================================================
 * 3. GLB Reader + Morph Baker
 * ========================================================================== */

function readGlbMesh(relPath) {
  const fullPath = path.join(MANNEQUIN_DIR, relPath);
  const buf = fs.readFileSync(fullPath);
  if (buf.toString('utf8', 0, 4) !== 'glTF') {
    throw new Error(`Invalid GLB header: ${fullPath}`);
  }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binOff = 20 + jsonLen + 8;
  const mesh = json.meshes[0];
  const prim = mesh.primitives[0];
  const targetNames = mesh.extras?.targetNames || [];

  const readTypedSlice = (bvIdx, byteOffset, count, componentType, numComp = 1) => {
    const bv = json.bufferViews[bvIdx];
    const elemBytes = componentType === 5126 || componentType === 5125 ? 4 : componentType === 5123 ? 2 : 1;
    if (bv.byteStride && bv.byteStride !== elemBytes * numComp) {
      throw new Error(`Interleaved bufferView ${bvIdx} (byteStride=${bv.byteStride}) not supported`);
    }
    const byteStart = binOff + (bv.byteOffset || 0) + (byteOffset || 0);
    if (componentType === 5126) {
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) out[i] = buf.readFloatLE(byteStart + i * 4);
      return out;
    }
    if (componentType === 5123) {
      const out = new Uint16Array(count);
      for (let i = 0; i < count; i++) out[i] = buf.readUInt16LE(byteStart + i * 2);
      return out;
    }
    if (componentType === 5125) {
      const out = new Uint32Array(count);
      for (let i = 0; i < count; i++) out[i] = buf.readUInt32LE(byteStart + i * 4);
      return out;
    }
    if (componentType === 5121) {
      const out = new Uint8Array(count);
      for (let i = 0; i < count; i++) out[i] = buf.readUInt8(byteStart + i);
      return out;
    }
    throw new Error(`Unsupported componentType ${componentType}`);
  };

  const readAccessor = (accIdx) => {
    const acc = json.accessors[accIdx];
    const numComp =
      acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC4' ? 4 : 1;
    const length = acc.count * numComp;
    let out;
    if (acc.bufferView !== undefined) {
      out = readTypedSlice(acc.bufferView, acc.byteOffset || 0, length, acc.componentType, numComp);
    } else if (acc.componentType === 5126) {
      out = new Float32Array(length);
    } else if (acc.componentType === 5123) {
      out = new Uint16Array(length);
    } else if (acc.componentType === 5125) {
      out = new Uint32Array(length);
    } else {
      out = new Uint8Array(length);
    }

    if (acc.sparse) {
      const sCount = acc.sparse.count;
      const sIndices = readTypedSlice(
        acc.sparse.indices.bufferView,
        acc.sparse.indices.byteOffset || 0,
        sCount,
        acc.sparse.indices.componentType,
        1
      );
      const sValues = readTypedSlice(
        acc.sparse.values.bufferView,
        acc.sparse.values.byteOffset || 0,
        sCount * numComp,
        acc.componentType,
        numComp
      );
      for (let i = 0; i < sCount; i++) {
        const dst = sIndices[i] * numComp;
        const src = i * numComp;
        for (let c = 0; c < numComp; c++) {
          out[dst + c] = sValues[src + c];
        }
      }
    }
    return out;
  };

  const basePos = readAccessor(prim.attributes.POSITION);
  const pos = new Float32Array(basePos);
  const norm = readAccessor(prim.attributes.NORMAL);
  const uv = readAccessor(prim.attributes.TEXCOORD_0);
  const idx = readAccessor(prim.indices);

  // Bake editorial morph targets into vertex positions
  const targets = prim.targets || [];
  for (let t = 0; t < targets.length; t++) {
    const tName = targetNames[t];
    const weight = EDITORIAL_MORPHS[tName];
    if (!weight) continue;
    const deltaPos = readAccessor(targets[t].POSITION);
    for (let i = 0; i < pos.length; i++) {
      pos[i] += deltaPos[i] * weight;
    }
  }

  return { basePos, pos, norm, uv, idx };
}

/* ==========================================================================
 * 4. Geometry Utilities (Normals, Submesh Filtering, Smooth Face & Hair Cap)
 * ========================================================================== */

function recomputeSmoothNormals(pos, idx) {
  const nVerts = pos.length / 3;
  const norm = new Float32Array(pos.length);

  // Weld coincident vertices so UV seams share smooth normals
  const weldMap = new Map();
  const weldId = new Int32Array(nVerts);
  let uniqueCount = 0;
  for (let i = 0; i < nVerts; i++) {
    const k = `${Math.round(pos[i * 3] * 10000)},${Math.round(pos[i * 3 + 1] * 10000)},${Math.round(pos[i * 3 + 2] * 10000)}`;
    let wid = weldMap.get(k);
    if (wid === undefined) {
      wid = uniqueCount++;
      weldMap.set(k, wid);
    }
    weldId[i] = wid;
  }

  const acc = new Float32Array(uniqueCount * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t];
    const i1 = idx[t + 1];
    const i2 = idx[t + 2];
    const ax = pos[i0 * 3];
    const ay = pos[i0 * 3 + 1];
    const az = pos[i0 * 3 + 2];
    const bx = pos[i1 * 3] - ax;
    const by = pos[i1 * 3 + 1] - ay;
    const bz = pos[i1 * 3 + 2] - az;
    const cx = pos[i2 * 3] - ax;
    const cy = pos[i2 * 3 + 1] - ay;
    const cz = pos[i2 * 3 + 2] - az;

    // Area-weighted face normal
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;

    const w0 = weldId[i0] * 3;
    const w1 = weldId[i1] * 3;
    const w2 = weldId[i2] * 3;
    acc[w0] += nx;
    acc[w0 + 1] += ny;
    acc[w0 + 2] += nz;
    acc[w1] += nx;
    acc[w1 + 1] += ny;
    acc[w1 + 2] += nz;
    acc[w2] += nx;
    acc[w2 + 1] += ny;
    acc[w2 + 2] += nz;
  }

  for (let i = 0; i < nVerts; i++) {
    const w = weldId[i] * 3;
    const nx = acc[w];
    const ny = acc[w + 1];
    const nz = acc[w + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    norm[i * 3] = nx / len;
    norm[i * 3 + 1] = ny / len;
    norm[i * 3 + 2] = nz / len;
  }
  return norm;
}

function filterTriangles(mesh, keepTriFn) {
  const keptTris = [];
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t];
    const b = mesh.idx[t + 1];
    const c = mesh.idx[t + 2];
    if (keepTriFn(a, b, c, mesh.pos)) {
      keptTris.push(a, b, c);
    }
  }
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1);
  const newPos = [];
  const newUv = [];
  const newIdx = new Uint16Array(keptTris.length);
  let nextId = 0;

  for (let i = 0; i < keptTris.length; i++) {
    const oldV = keptTris[i];
    let mapped = remap[oldV];
    if (mapped === -1) {
      if (nextId > 65535) {
        throw new Error('Filtered mesh exceeds Uint16 index capacity (65535 vertices)');
      }
      mapped = nextId++;
      remap[oldV] = mapped;
      newPos.push(mesh.pos[oldV * 3], mesh.pos[oldV * 3 + 1], mesh.pos[oldV * 3 + 2]);
      newUv.push(mesh.uv[oldV * 2], mesh.uv[oldV * 2 + 1]);
    }
    newIdx[i] = mapped;
  }

  const pos = new Float32Array(newPos);
  const uv = new Float32Array(newUv);
  const norm = recomputeSmoothNormals(pos, newIdx);
  return { pos, norm, uv, idx: newIdx };
}

/**
 * Gently smooths facial landmarks (eyelids, nostrils, lips) into a clean
 * museum-grade atelier sculpted mannequin face while preserving the strong
 * jawline, cheekbones, brow ridge, and ear silhouettes (matching the luxury
 * faceless mannequin look in Ainvtry's Studio art direction).
 */
function sculptAtelierMannequinFace(pos, idx, joints) {
  const nVerts = pos.length / 3;
  const headY = joints.head[1];
  const headZ = joints.head[2];

  // Build welded adjacency for clean Laplacian smoothing across UV seams
  const weldMap = new Map();
  const weldId = new Int32Array(nVerts);
  const uniqueVerts = [];
  for (let i = 0; i < nVerts; i++) {
    const k = `${Math.round(pos[i * 3] * 10000)},${Math.round(pos[i * 3 + 1] * 10000)},${Math.round(pos[i * 3 + 2] * 10000)}`;
    let wid = weldMap.get(k);
    if (wid === undefined) {
      wid = uniqueVerts.length;
      weldMap.set(k, wid);
      uniqueVerts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    }
    weldId[i] = wid;
  }

  const adj = Array.from({ length: uniqueVerts.length }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = weldId[idx[t]];
    const b = weldId[idx[t + 1]];
    const c = weldId[idx[t + 2]];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }

  // Face smoothing mask: strong over eyes/nose/mouth front plate, zero on jaw/ears/neck
  const mask = new Float32Array(uniqueVerts.length);
  for (let w = 0; w < uniqueVerts.length; w++) {
    const [x, y, z] = uniqueVerts[w];
    if (y > headY - 0.085 && y < headY + 0.085 && z > headZ + 0.032 && Math.abs(x) < 0.072) {
      const fx = 1 - Math.min(1, Math.abs(x) / 0.072);
      const fy = 1 - Math.min(1, Math.abs(y - (headY + 0.005)) / 0.085);
      const fz = Math.min(1, (z - (headZ + 0.032)) / 0.045);
      mask[w] = Math.min(1, fx * fy * fz * 2.1);
    }
  }

  // 16 passes of gentle smoothing on facial details while keeping nose bridge & jawline dignified
  for (let iter = 0; iter < 16; iter++) {
    const next = uniqueVerts.map((p) => [p[0], p[1], p[2]]);
    for (let w = 0; w < uniqueVerts.length; w++) {
      const m = mask[w];
      if (m <= 0.01) continue;
      const nbrs = adj[w];
      if (!nbrs.size) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const nb of nbrs) {
        sx += uniqueVerts[nb][0];
        sy += uniqueVerts[nb][1];
        sz += uniqueVerts[nb][2];
      }
      const inv = 1 / nbrs.size;
      const alpha = 0.44 * m;
      next[w][0] += (sx * inv - uniqueVerts[w][0]) * alpha;
      next[w][1] += (sy * inv - uniqueVerts[w][1]) * alpha;
      next[w][2] += (sz * inv - uniqueVerts[w][2]) * alpha;
    }
    for (let w = 0; w < uniqueVerts.length; w++) {
      uniqueVerts[w] = next[w];
    }
  }

  for (let i = 0; i < nVerts; i++) {
    const p = uniqueVerts[weldId[i]];
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  }
}

/**
 * Generates a conformal sculpted swept-back editorial hair cap directly from
 * the upper cranium surface of `body.glb`. Boundary vertices tuck smoothly
 * beneath the scalp surface along an analytic hairline contour so the visible
 * scalp-hair intersection forms a razor-smooth curve with ZERO sawtooth edges
 * and cleanly clears both ears.
 */
function buildConformalHairMesh(bodyMesh, joints) {
  const headY = joints.head[1];
  const headZ = joints.head[2];

  // Signed distance (meters) inside the sculpted hair region (> 0 inside hair, < 0 outside)
  const hairSignedMargin = (x, y, z) => {
    const dy = y - headY;
    const dz = z - headZ;
    const ax = Math.abs(x);

    // Analytic groomed editorial hairline:
    // High swept forehead (headY + 0.068), clean temple taper, wraps behind ears to nape (headY - 0.036)
    const frontT = clamp01((dz + 0.045) / 0.135);
    const frontSmooth = frontT * frontT * (3 - 2 * frontT);
    const centerForeheadArch = Math.exp(-Math.pow(ax / 0.055, 2)) * 0.012 * frontSmooth;
    const partNotch = Math.exp(-Math.pow((x - 0.032) / 0.014, 2)) * 0.008 * frontSmooth;
    const hairlineY = headY - 0.034 + frontSmooth * 0.094 + centerForeheadArch + partNotch;

    // Smooth circular exclusion around both ears so hair tucks cleanly behind/above the ear
    const earDist = Math.hypot((ax - 0.072) * 1.05, (dy + 0.002) * 0.92, (dz + 0.012) * 0.90);
    const earPenalty = Math.max(0, 0.048 - earDist) * 2.4;

    return y - hairlineY - earPenalty;
  };

  // Keep a 1-ring skirt slightly outside the hairline (margin > -0.014) so the hair rim
  // smoothly descends INTO the porcelain head surface with zero jagged triangle edges!
  const scalpMesh = filterTriangles(bodyMesh, (a, b, c, pos) => {
    const ma = hairSignedMargin(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
    const mb = hairSignedMargin(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
    const mc = hairSignedMargin(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]);
    // Exclude protruding ear geometry (full ear helix through lobe) outright
    const earOut = (vi) =>
      Math.abs(pos[vi * 3]) > 0.060 &&
      pos[vi * 3 + 1] < headY + 0.042 &&
      pos[vi * 3 + 1] > headY - 0.058 &&
      pos[vi * 3 + 2] > headZ - 0.052 &&
      pos[vi * 3 + 2] < headZ + 0.026;
    if (earOut(a) || earOut(b) || earOut(c)) return false;
    return Math.max(ma, mb, mc) > 0.001 && Math.min(ma, mb, mc) > -0.016;
  });

  const sNorm = recomputeSmoothNormals(scalpMesh.pos, scalpMesh.idx);
  const nVerts = scalpMesh.pos.length / 3;
  for (let i = 0; i < nVerts; i++) {
    const x = scalpMesh.pos[i * 3];
    const y = scalpMesh.pos[i * 3 + 1];
    const z = scalpMesh.pos[i * 3 + 2];
    const margin = hairSignedMargin(x, y, z);
    const nx = sNorm[i * 3];
    const ny = sNorm[i * 3 + 1];
    const nz = sNorm[i * 3 + 2];

    const dy = y - headY;
    const dz = z - headZ;
    const topBoost = smoothstep(0.015, 0.115, dy);
    const frontWave = smoothstep(-0.01, 0.095, dz) * topBoost;
    const sideTaper = 0.42 + 0.58 * topBoost;

    // Combed swept-back editorial texture + natural side-part crease
    const strandRidge = Math.sin(x * 74 + dz * 16) * 0.0011 * topBoost;
    const partCrease = Math.exp(-Math.pow((x - 0.032) / 0.012, 2)) * topBoost * -0.0032;

    // Smoothly rise from -3.5mm (tucked cleanly inside skull!) at margin <= 0 to full sculpted volume
    const rise = smoothstep(-0.004, 0.032, margin);
    const targetThickness = 0.004 + 0.0135 * sideTaper + 0.011 * frontWave + strandRidge + partCrease;
    const offset = -0.0035 * (1 - rise) + targetThickness * rise;

    scalpMesh.pos[i * 3] = x + nx * offset;
    scalpMesh.pos[i * 3 + 1] = y + ny * offset + 0.0055 * frontWave * rise;
    scalpMesh.pos[i * 3 + 2] = z + nz * offset - 0.005 * frontWave * rise;
  }

  // 2 gentle smoothing passes on hair volume for organic luxury sculpt finish
  const weldMap = new Map();
  const weldId = new Int32Array(nVerts);
  const uVerts = [];
  for (let i = 0; i < nVerts; i++) {
    const k = `${Math.round(scalpMesh.pos[i * 3] * 10000)},${Math.round(scalpMesh.pos[i * 3 + 1] * 10000)},${Math.round(scalpMesh.pos[i * 3 + 2] * 10000)}`;
    let wid = weldMap.get(k);
    if (wid === undefined) {
      wid = uVerts.length;
      weldMap.set(k, wid);
      uVerts.push([scalpMesh.pos[i * 3], scalpMesh.pos[i * 3 + 1], scalpMesh.pos[i * 3 + 2]]);
    }
    weldId[i] = wid;
  }
  const adj = Array.from({ length: uVerts.length }, () => new Set());
  for (let t = 0; t < scalpMesh.idx.length; t += 3) {
    const a = weldId[scalpMesh.idx[t]];
    const b = weldId[scalpMesh.idx[t + 1]];
    const c = weldId[scalpMesh.idx[t + 2]];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = uVerts.map((p) => [p[0], p[1], p[2]]);
    for (let w = 0; w < uVerts.length; w++) {
      if (adj[w].size < 3) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const nb of adj[w]) {
        sx += uVerts[nb][0];
        sy += uVerts[nb][1];
        sz += uVerts[nb][2];
      }
      const inv = 1 / adj[w].size;
      next[w][0] += (sx * inv - uVerts[w][0]) * 0.28;
      next[w][1] += (sy * inv - uVerts[w][1]) * 0.28;
      next[w][2] += (sz * inv - uVerts[w][2]) * 0.28;
    }
    for (let w = 0; w < uVerts.length; w++) uVerts[w] = next[w];
  }
  for (let i = 0; i < nVerts; i++) {
    const p = uVerts[weldId[i]];
    scalpMesh.pos[i * 3] = p[0];
    scalpMesh.pos[i * 3 + 1] = p[1];
    scalpMesh.pos[i * 3 + 2] = p[2];
  }

  scalpMesh.norm = recomputeSmoothNormals(scalpMesh.pos, scalpMesh.idx);
  return scalpMesh;
}

/* ==========================================================================
 * 5. Morphed Joint Solver (Locks 20 Bones to Baked Morph Positions)
 * ========================================================================== */

function computeMorphedJoints(rawJoints, bodyBasePos, bodyMorphedPos) {
  const nVerts = bodyBasePos.length / 3;
  const morphed = {};
  for (const [name, coord] of Object.entries(rawJoints)) {
    // Average morph delta of the 12 nearest rest vertices to this joint
    const nearest = [];
    for (let i = 0; i < nVerts; i++) {
      const dx = bodyBasePos[i * 3] - coord[0];
      const dy = bodyBasePos[i * 3 + 1] - coord[1];
      const dz = bodyBasePos[i * 3 + 2] - coord[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (nearest.length < 12) {
        nearest.push({ i, d2 });
        if (nearest.length === 12) nearest.sort((a, b) => a.d2 - b.d2);
      } else if (d2 < nearest[11].d2) {
        nearest[11] = { i, d2 };
        nearest.sort((a, b) => a.d2 - b.d2);
      }
    }
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const item of nearest) {
      const idx = item.i * 3;
      sx += bodyMorphedPos[idx] - bodyBasePos[idx];
      sy += bodyMorphedPos[idx + 1] - bodyBasePos[idx + 1];
      sz += bodyMorphedPos[idx + 2] - bodyBasePos[idx + 2];
    }
    const inv = 1 / nearest.length;
    const nextX = name.endsWith('L') || name.endsWith('R') ? coord[0] + sx * inv : 0;
    morphed[name] = [nextX, coord[1] + sy * inv, coord[2] + sz * inv];
  }
  return morphed;
}

/* ==========================================================================
 * 6. Region-Partitioned Smooth 20-Bone Skinning Weights
 * ========================================================================== */

function distToSegment(px, py, pz, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = px - a[0];
  const apy = py - a[1];
  const apz = pz - a[2];
  const abLenSq = abx * abx + aby * aby + abz * abz || 1e-8;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
  const cx = a[0] + abx * t;
  const cy = a[1] + aby * t;
  const cz = a[2] + abz * t;
  return { dist: Math.hypot(px - cx, py - cy, pz - cz), t };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

function normalizeTop4(entries) {
  const merged = new Map();
  for (const [j, w] of entries) {
    if (w <= 1e-5) continue;
    merged.set(j, (merged.get(j) || 0) + w);
  }
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const [, w] of sorted) sum += w;
  if (sum <= 1e-6) {
    return [
      [0, 0, 0, 0],
      [255, 0, 0, 0],
    ];
  }
  const joints = [0, 0, 0, 0];
  const weightsFloat = [0, 0, 0, 0];
  for (let i = 0; i < sorted.length; i++) {
    joints[i] = sorted[i][0];
    weightsFloat[i] = sorted[i][1] / sum;
  }
  // Quantize to Uint8 summing to EXACTLY 255
  const q = weightsFloat.map((w) => Math.floor(w * 255));
  let rem = 255 - (q[0] + q[1] + q[2] + q[3]);
  const fracOrder = weightsFloat
    .map((w, i) => ({ i, frac: w * 255 - q[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    q[fracOrder[k % 4].i] += 1;
  }
  return [joints, q];
}

function computeVertexSkin(x, y, z, kind, joints) {
  const J = BONE_INDEX;

  if (kind === 'hair') {
    return normalizeTop4([[J.head, 1.0]]);
  }

  if (kind === 'shoes') {
    const isLeft = x >= 0;
    const ankle = isLeft ? J.ankleL : J.ankleR;
    const knee = isLeft ? J.kneeL : J.kneeR;
    const ankleY = isLeft ? joints.ankleL[1] : joints.ankleR[1];
    const up = smoothstep(ankleY + 0.04, ankleY + 0.14, y);
    return normalizeTop4([
      [ankle, 1 - up * 0.25],
      [knee, up * 0.25],
    ]);
  }

  if (kind === 'slacks') {
    const isLeft = x >= 0;
    const hip = isLeft ? J.hipL : J.hipR;
    const knee = isLeft ? J.kneeL : J.kneeR;
    const ankle = isLeft ? J.ankleL : J.ankleR;
    const hipY = joints.hipL[1];
    const kneeY = joints.kneeL[1];
    const ankleY = joints.ankleL[1];

    // Upper waistband blends cleanly into pelvis/spine3
    if (y > hipY + 0.02) {
      const pelvisW = smoothstep(hipY + 0.01, hipY + 0.11, y);
      const spine3W = smoothstep(hipY + 0.08, joints.spine3[1], y) * 0.45;
      return normalizeTop4([
        [J.pelvis, pelvisW * (1 - spine3W)],
        [J.spine3, spine3W],
        [hip, 1 - pelvisW],
      ]);
    }

    // Thigh -> Knee -> Shin -> Ankle smooth transitions
    const thighToKnee = smoothstep(kneeY + 0.085, kneeY - 0.065, y);
    const kneeToAnkle = smoothstep(ankleY + 0.075, ankleY - 0.01, y);
    const pelvisBleed = smoothstep(hipY - 0.14, hipY + 0.03, y) * (1 - Math.min(1, Math.abs(x) / 0.11)) * 0.45;
    const legW = 1 - pelvisBleed;
    const wHip = legW * (1 - thighToKnee);
    const wKnee = legW * thighToKnee * (1 - kneeToAnkle);
    const wAnkle = legW * thighToKnee * kneeToAnkle;
    return normalizeTop4([
      [J.pelvis, pelvisBleed],
      [hip, wHip],
      [knee, wKnee],
      [ankle, wAnkle],
    ]);
  }

  // Head + Neck region (body / knit collar)
  if (y > joints.neck[1] - 0.055 && Math.abs(x) < 0.145) {
    const headT = smoothstep(joints.neck[1] + 0.01, joints.head[1] - 0.02, y);
    const neckT = smoothstep(joints.spine1[1] + 0.06, joints.neck[1] - 0.005, y);
    return normalizeTop4([
      [J.spine1, 1 - neckT],
      [J.neck, neckT * (1 - headT)],
      [J.head, neckT * headT],
    ]);
  }

  // Detect Left / Right Arm vs Torso (critical for clean sleeve articulation!)
  const isLeftSide = x >= 0;
  const shoulder = isLeftSide ? joints.shoulderL : joints.shoulderR;
  const elbow = isLeftSide ? joints.elbowL : joints.elbowR;
  const hand = isLeftSide ? joints.handL : joints.handR;
  const handTip = isLeftSide ? joints.handTipL : joints.handTipR;

  const upperSeg = distToSegment(x, y, z, shoulder, elbow);
  const foreSeg = distToSegment(x, y, z, elbow, hand);
  const handSeg = distToSegment(x, y, z, hand, handTip);
  const minArmDist = Math.min(upperSeg.dist, foreSeg.dist, handSeg.dist);

  const ax = Math.abs(x);
  const shX = Math.abs(shoulder[0]);
  // Armpit boundary slopes slightly down as we move outward along the A-pose arm
  const isArmVertex =
    kind === 'body'
      ? ax > 0.24 && y > 0.72
      : (ax > shX - 0.028 && minArmDist < 0.135 && y > 0.84) || (ax > shX + 0.055 && y > 0.78);

  if (isArmVertex) {
    const jClav = isLeftSide ? J.clavicleL : J.clavicleR;
    const jSh = isLeftSide ? J.shoulderL : J.shoulderR;
    const jElb = isLeftSide ? J.elbowL : J.elbowR;
    const jHand = isLeftSide ? J.handL : J.handR;

    if (kind === 'body') {
      // Sculpted hands + wrists follow elbow rigidly into hand (clean cuff-to-wrist articulation)
      const handW = smoothstep(0.92, 1.05, foreSeg.t) * 0.88;
      return normalizeTop4([
        [jElb, 1 - handW],
        [jHand, handW],
      ]);
    }

    // Coat sleeve smooth blending: shoulder cap -> upper arm -> elbow -> forearm -> cuff (rigidly on elbow)
    if (foreSeg.dist < upperSeg.dist - 0.008 || upperSeg.t > 0.92) {
      const elbBlend = smoothstep(0.0, 0.28, foreSeg.t);
      return normalizeTop4([
        [jSh, 1 - elbBlend],
        [jElb, elbBlend],
      ]);
    }

    // Upper sleeve + deltoid shoulder cap
    const intoArm = smoothstep(shX - 0.038, shX + 0.052, ax);
    const toElbow = smoothstep(0.68, 1.05, upperSeg.t);
    const torsoW = 1 - intoArm;
    return normalizeTop4([
      [J.spine1, torsoW * 0.45],
      [jClav, torsoW * 0.55],
      [jSh, intoArm * (1 - toElbow)],
      [jElb, intoArm * toElbow],
    ]);
  }

  // Torso & Coat Skirt (strictly spine + pelvis + smooth lower-hem leg drape)
  const pelvisY = joints.pelvis[1];
  const spine3Y = joints.spine3[1];
  const spine2Y = joints.spine2[1];
  const spine1Y = joints.spine1[1];

  if (y < pelvisY) {
    // Coat skirt below pelvis: smoothly drapes over striding thighs during Walk with zero clipping
    const hemT = smoothstep(pelvisY, 0.52, y); // 0 at pelvis -> 1 at lower coat skirt
    const sideSplit = smoothstep(0.0, 0.065, Math.abs(x));
    const hipFollow = hemT * 0.72 * sideSplit;
    const kneeFollow = hemT * hemT * 0.14 * sideSplit;
    const hipBone = x >= 0 ? J.hipL : J.hipR;
    const kneeBone = x >= 0 ? J.kneeL : J.kneeR;
    return normalizeTop4([
      [J.pelvis, 1 - hipFollow - kneeFollow],
      [hipBone, hipFollow],
      [kneeBone, kneeFollow],
    ]);
  }

  if (y < spine3Y) {
    const t = smoothstep(pelvisY, spine3Y, y);
    return normalizeTop4([
      [J.pelvis, 1 - t],
      [J.spine3, t],
    ]);
  }

  if (y < spine2Y) {
    const t = smoothstep(spine3Y, spine2Y, y);
    return normalizeTop4([
      [J.spine3, 1 - t],
      [J.spine2, t],
    ]);
  }

  if (y < spine1Y) {
    const t = smoothstep(spine2Y, spine1Y, y);
    return normalizeTop4([
      [J.spine2, 1 - t],
      [J.spine1, t],
    ]);
  }

  // Upper chest / shoulders near clavicle
  const clavW = smoothstep(0.06, shX - 0.02, ax) * 0.48;
  const jClav = isLeftSide ? J.clavicleL : J.clavicleR;
  const neckW = smoothstep(spine1Y + 0.09, joints.neck[1] + 0.01, y) * (1 - smoothstep(0.06, 0.12, ax));
  return normalizeTop4([
    [J.spine1, (1 - clavW) * (1 - neckW)],
    [jClav, clavW],
    [J.neck, neckW],
  ]);
}

/**
 * Computes skin weights for a mesh. For `coat`, small disconnected islands
 * (cuff buttons & cuff tabs) inherit rigid centroid skinning so buttons never
 * stretch or shear during arm poses.
 */
function buildSkinAttributes(mesh, kind, joints) {
  const nVerts = mesh.pos.length / 3;
  const jointsBuf = new Uint8Array(nVerts * 4);
  const weightsBuf = new Uint8Array(nVerts * 4);

  // Detect small rigid islands (buttons/tabs) on coat
  const islandOverride = new Map();
  if (kind === 'coat') {
    const parent = new Int32Array(nVerts);
    for (let i = 0; i < nVerts; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[a] = b;
    };
    const posMap = new Map();
    for (let i = 0; i < nVerts; i++) {
      const k = `${Math.round(mesh.pos[i * 3] * 2000)},${Math.round(mesh.pos[i * 3 + 1] * 2000)},${Math.round(mesh.pos[i * 3 + 2] * 2000)}`;
      if (posMap.has(k)) union(i, posMap.get(k));
      else posMap.set(k, i);
    }
    for (let t = 0; t < mesh.idx.length; t += 3) {
      union(mesh.idx[t], mesh.idx[t + 1]);
      union(mesh.idx[t + 1], mesh.idx[t + 2]);
    }
    const groups = new Map();
    for (let i = 0; i < nVerts; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    for (const members of groups.values()) {
      if (members.length < 180) {
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (const vi of members) {
          cx += mesh.pos[vi * 3];
          cy += mesh.pos[vi * 3 + 1];
          cz += mesh.pos[vi * 3 + 2];
        }
        const inv = 1 / members.length;
        const rigidSkin = computeVertexSkin(cx * inv, cy * inv, cz * inv, kind, joints);
        for (const vi of members) {
          islandOverride.set(vi, rigidSkin);
        }
      }
    }
  }

  for (let i = 0; i < nVerts; i++) {
    const [j4, w4] =
      islandOverride.get(i) ??
      computeVertexSkin(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2], kind, joints);
    jointsBuf[i * 4] = j4[0];
    jointsBuf[i * 4 + 1] = j4[1];
    jointsBuf[i * 4 + 2] = j4[2];
    jointsBuf[i * 4 + 3] = j4[3];
    weightsBuf[i * 4] = w4[0];
    weightsBuf[i * 4 + 1] = w4[1];
    weightsBuf[i * 4 + 2] = w4[2];
    weightsBuf[i * 4 + 3] = w4[3];
  }

  return { jointsBuf, weightsBuf };
}

/* ==========================================================================
 * 7. Fast Spatial-Grid Ray-Traced Vertex Ambient Occlusion (Studio Depth!)
 * ========================================================================== */

function bakeStudioVertexAO(parts) {
  // Collect all triangles across all parts into one occlusion acceleration grid
  const tris = [];
  for (const part of parts) {
    const { pos, idx } = part.mesh;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      tris.push([
        pos[a],
        pos[a + 1],
        pos[a + 2],
        pos[b],
        pos[b + 1],
        pos[b + 2],
        pos[c],
        pos[c + 1],
        pos[c + 2],
      ]);
    }
  }

  const CELL = 0.085;
  const grid = new Map();
  const cellKey = (ix, iy, iz) => `${ix},${iy},${iz}`;
  for (let ti = 0; ti < tris.length; ti++) {
    const tr = tris[ti];
    const minX = Math.floor(Math.min(tr[0], tr[3], tr[6]) / CELL);
    const maxX = Math.floor(Math.max(tr[0], tr[3], tr[6]) / CELL);
    const minY = Math.floor(Math.min(tr[1], tr[4], tr[7]) / CELL);
    const maxY = Math.floor(Math.max(tr[1], tr[4], tr[7]) / CELL);
    const minZ = Math.floor(Math.min(tr[2], tr[5], tr[8]) / CELL);
    const maxZ = Math.floor(Math.max(tr[2], tr[5], tr[8]) / CELL);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const k = cellKey(ix, iy, iz);
          let arr = grid.get(k);
          if (!arr) {
            arr = [];
            grid.set(k, arr);
          }
          arr.push(ti);
        }
      }
    }
  }

  // Cosine-weighted Fibonacci hemisphere samples (18 directions)
  const RAY_COUNT = 18;
  const localDirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < RAY_COUNT; k++) {
    const z = Math.sqrt((k + 0.5) / RAY_COUNT);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = golden * k;
    localDirs.push([Math.cos(phi) * r, Math.sin(phi) * r, z]);
  }

  const rayHit = (ox, oy, oz, dx, dy, dz, maxT) => {
    // 3D DDA traversal across 2..4 cells up to maxT
    const steps = 4;
    const tested = new Set();
    for (let s = 0; s <= steps; s++) {
      const dist = (s / steps) * maxT;
      const ix = Math.floor((ox + dx * dist) / CELL);
      const iy = Math.floor((oy + dy * dist) / CELL);
      const iz = Math.floor((oz + dz * dist) / CELL);
      const bucket = grid.get(cellKey(ix, iy, iz));
      if (!bucket) continue;
      for (let bi = 0; bi < bucket.length; bi++) {
        const ti = bucket[bi];
        if (tested.has(ti)) continue;
        tested.add(ti);
        const tr = tris[ti];
        // Moller-Trumbore intersection
        const e1x = tr[3] - tr[0];
        const e1y = tr[4] - tr[1];
        const e1z = tr[5] - tr[2];
        const e2x = tr[6] - tr[0];
        const e2y = tr[7] - tr[1];
        const e2z = tr[8] - tr[2];
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-7 && det < 1e-7) continue;
        const invDet = 1 / det;
        const tx = ox - tr[0];
        const ty = oy - tr[1];
        const tz = oz - tr[2];
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (t > 0.004 && t < maxT) return true;
      }
    }
    return false;
  };

  for (const part of parts) {
    const { pos, norm } = part.mesh;
    const nVerts = pos.length / 3;
    const colors = new Uint8Array(nVerts * 4);
    const maxDist = part.kind === 'body' || part.kind === 'hair' ? 0.14 : 0.22;

    for (let i = 0; i < nVerts; i++) {
      const px = pos[i * 3];
      const py = pos[i * 3 + 1];
      const pz = pos[i * 3 + 2];
      const nx = norm[i * 3];
      const ny = norm[i * 3 + 1];
      const nz = norm[i * 3 + 2];

      // Orthonormal tangent frame around normal
      const upX = Math.abs(ny) < 0.9 ? 0 : 1;
      const upY = Math.abs(ny) < 0.9 ? 1 : 0;
      const upZ = 0;
      let tx = upY * nz - upZ * ny;
      let ty = upZ * nx - upX * nz;
      let tz = upX * ny - upY * nx;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;

      const ox = px + nx * 0.003;
      const oy = py + ny * 0.003;
      const oz = pz + nz * 0.003;

      let hits = 0;
      for (let r = 0; r < RAY_COUNT; r++) {
        const [lx, ly, lz] = localDirs[r];
        const dx = tx * lx + bx * ly + nx * lz;
        const dy = ty * lx + by * ly + ny * lz;
        const dz = tz * lx + bz * ly + nz * lz;
        if (rayHit(ox, oy, oz, dx, dy, dz, maxDist)) hits++;
      }

      // Soft studio floor + sky bounce combined with ray-traced crevice AO
      const rawAo = 1 - hits / RAY_COUNT;
      const hemi = 0.88 + 0.12 * ny;
      const ao = clamp01(0.42 + 0.58 * rawAo) * hemi;
      const cVal = Math.round(clamp01(ao) * 255);
      colors[i * 4] = cVal;
      colors[i * 4 + 1] = cVal;
      colors[i * 4 + 2] = cVal;
      colors[i * 4 + 3] = 255;
    }

    part.colorsBuf = colors;
  }
}

/* ==========================================================================
 * 8. GLB Binary Writer (Standard glTF 2.0 + Single Shared 20-Bone Skin)
 * ========================================================================== */

function writeSkinnedGlb(parts, joints, outPath) {
  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  const appendBuffer = (typedArray, target) => {
    const pad = (4 - (byteOffset % 4)) % 4;
    if (pad > 0) {
      chunks.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    const raw = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const bvIdx = bufferViews.length;
    const bv = {
      buffer: 0,
      byteOffset,
      byteLength: raw.byteLength,
    };
    if (target) bv.target = target;
    bufferViews.push(bv);
    chunks.push(raw);
    byteOffset += raw.byteLength;
    return bvIdx;
  };

  const addAccessor = (typedArray, componentType, type, count, target, normalized = false, bounds = false) => {
    const bvIdx = appendBuffer(typedArray, target);
    const acc = {
      bufferView: bvIdx,
      componentType,
      count,
      type,
    };
    if (normalized) acc.normalized = true;
    if (bounds && type === 'VEC3') {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < 3; k++) {
          const v = typedArray[i * 3 + k];
          if (v < min[k]) min[k] = v;
          if (v > max[k]) max[k] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  };

  // Inverse Bind Matrices (translation-only world-to-joint in column-major MAT4)
  const ibm = new Float32Array(BONE_SPECS.length * 16);
  for (let b = 0; b < BONE_SPECS.length; b++) {
    const [jx, jy, jz] = joints[BONE_SPECS[b].name];
    const off = b * 16;
    ibm[off] = 1;
    ibm[off + 5] = 1;
    ibm[off + 10] = 1;
    ibm[off + 15] = 1;
    ibm[off + 12] = -jx;
    ibm[off + 13] = -jy;
    ibm[off + 14] = -jz;
  }
  const ibmAcc = addAccessor(ibm, 5126, 'MAT4', BONE_SPECS.length);

  // Build skeleton nodes (0..19)
  const nodes = BONE_SPECS.map((spec, idx) => {
    const pos = joints[spec.name];
    const parentPos = spec.parent >= 0 ? joints[BONE_SPECS[spec.parent].name] : [0, 0, 0];
    const node = {
      name: spec.name,
      translation: [
        +(pos[0] - parentPos[0]).toFixed(6),
        +(pos[1] - parentPos[1]).toFixed(6),
        +(pos[2] - parentPos[2]).toFixed(6),
      ],
    };
    const children = [];
    for (let c = 0; c < BONE_SPECS.length; c++) {
      if (BONE_SPECS[c].parent === idx) children.push(c);
    }
    if (children.length > 0) node.children = children;
    return node;
  });

  const meshes = [];
  const materials = [];
  const meshNodeIndices = [];

  for (const part of parts) {
    const matIdx = materials.length;
    materials.push({
      name: part.materialName,
      pbrMetallicRoughness: {
        baseColorFactor: part.baseColorFactor,
        metallicFactor: part.metallicFactor,
        roughnessFactor: part.roughnessFactor,
      },
      doubleSided: part.doubleSided ?? false,
    });

    const nVerts = part.mesh.pos.length / 3;
    const posAcc = addAccessor(part.mesh.pos, 5126, 'VEC3', nVerts, 34962, false, true);
    const normAcc = addAccessor(part.mesh.norm, 5126, 'VEC3', nVerts, 34962);
    const uvAcc = addAccessor(part.mesh.uv, 5126, 'VEC2', nVerts, 34962);
    const colAcc = addAccessor(part.colorsBuf, 5121, 'VEC4', nVerts, 34962, true);
    const jntAcc = addAccessor(part.skin.jointsBuf, 5121, 'VEC4', nVerts, 34962);
    const wgtAcc = addAccessor(part.skin.weightsBuf, 5121, 'VEC4', nVerts, 34962, true);
    const idxAcc = addAccessor(part.mesh.idx, 5123, 'SCALAR', part.mesh.idx.length, 34963);

    const meshIdx = meshes.length;
    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            TEXCOORD_0: uvAcc,
            COLOR_0: colAcc,
            JOINTS_0: jntAcc,
            WEIGHTS_0: wgtAcc,
          },
          indices: idxAcc,
          material: matIdx,
        },
      ],
    });

    const nodeIdx = nodes.length;
    nodes.push({
      name: part.name,
      mesh: meshIdx,
      skin: 0,
    });
    meshNodeIndices.push(nodeIdx);
  }

  // Root container node
  const rootNodeIdx = nodes.length;
  nodes.push({
    name: 'AinvtryStudioMannequin',
    children: [0, ...meshNodeIndices],
  });

  // Pad binary buffer to 4-byte alignment
  const binPad = (4 - (byteOffset % 4)) % 4;
  if (binPad > 0) {
    chunks.push(Buffer.alloc(binPad));
    byteOffset += binPad;
  }
  const binBuf = Buffer.concat(chunks);

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Ainvtry Studio Mannequin Optimizer (CC0 MakeHuman base)',
    },
    scene: 0,
    scenes: [{ name: 'StudioMannequinScene', nodes: [rootNodeIdx] }],
    nodes,
    meshes,
    materials,
    skins: [
      {
        name: 'Ainvtry20BoneRig',
        inverseBindMatrices: ibmAcc,
        skeleton: 0,
        joints: BONE_SPECS.map((_, i) => i),
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuf.byteLength }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.byteLength % 4)) % 4;
  if (jsonPad > 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  }

  const totalLen = 12 + 8 + jsonBuf.byteLength + 8 + binBuf.byteLength;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'utf8');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonChunkHdr = Buffer.alloc(8);
  jsonChunkHdr.writeUInt32LE(jsonBuf.byteLength, 0);
  jsonChunkHdr.writeUInt32LE(0x4e4f534a, 4); // JSON

  const binChunkHdr = Buffer.alloc(8);
  binChunkHdr.writeUInt32LE(binBuf.byteLength, 0);
  binChunkHdr.writeUInt32LE(0x004e4942, 4); // BIN

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, jsonChunkHdr, jsonBuf, binChunkHdr, binBuf]));
  return totalLen;
}

/* ==========================================================================
 * 9. Main Pipeline
 * ========================================================================== */

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(MANNEQUIN_DIR, 'manifest.json'), 'utf8'));

  const bodyRaw = readGlbMesh('body.glb');
  const coatRaw = readGlbMesh('garments/outer_coat.glb');
  const knitRaw = readGlbMesh('garments/top_knit.glb');
  const slacksRaw = readGlbMesh('garments/bottom_slacks.glb');
  const shoesRaw = readGlbMesh('garments/shoes_boots.glb');

  // Lock 20-bone joint positions to baked editorial morphs
  const joints = computeMorphedJoints(manifest.joints, bodyRaw.basePos, bodyRaw.pos);

  // Normalize vertical floor contact so shoe soles sit at EXACTLY y = 0.000
  let minShoeY = Infinity;
  for (let i = 1; i < shoesRaw.pos.length; i += 3) {
    if (shoesRaw.pos[i] < minShoeY) minShoeY = shoesRaw.pos[i];
  }
  const floorShift = -minShoeY;
  for (const m of [bodyRaw, coatRaw, knitRaw, slacksRaw, shoesRaw]) {
    for (let i = 1; i < m.pos.length; i += 3) {
      m.pos[i] += floorShift;
    }
  }
  for (const coord of Object.values(joints)) {
    coord[1] += floorShift;
  }

  // Smooth the raw body facial features into an atelier luxury sculpted mannequin bust
  sculptAtelierMannequinFace(bodyRaw.pos, bodyRaw.idx, joints);

  // Build conformal editorial hair cap directly from the scalp mesh
  const hairMesh = buildConformalHairMesh(bodyRaw, joints);

  // Clean out the 2 small dress-shirt cuff stub islands inside outer_coat (we pair the coat with a knit turtleneck!)
  // and record the 10 real horn button islands (count ~73) for subtle dark-horn shading contrast.
  const coatButtonVerts = new Set();
  const coatFiltered = (() => {
    const n = coatRaw.pos.length / 3;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const uni = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[a] = b;
    };
    const pm = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(coatRaw.pos[i * 3] * 2000)},${Math.round(coatRaw.pos[i * 3 + 1] * 2000)},${Math.round(coatRaw.pos[i * 3 + 2] * 2000)}`;
      if (pm.has(k)) uni(i, pm.get(k));
      else pm.set(k, i);
    }
    for (let t = 0; t < coatRaw.idx.length; t += 3) {
      uni(coatRaw.idx[t], coatRaw.idx[t + 1]);
      uni(coatRaw.idx[t + 1], coatRaw.idx[t + 2]);
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    const dropRoots = new Set();
    const buttonRoots = new Set();
    for (const [r, members] of groups.entries()) {
      let cx = 0;
      let cz = 0;
      for (const vi of members) {
        cx += coatRaw.pos[vi * 3];
        cz += coatRaw.pos[vi * 3 + 2];
      }
      cx /= members.length;
      cz /= members.length;
      if (
        (members.length >= 90 && members.length <= 130 && Math.abs(cx) > 0.38 && cz > 0.145) ||
        (members.length < 90 && Math.abs(cx) > 0.455 && cz > 0.13)
      ) {
        dropRoots.add(r);
      } else if (members.length < 90) {
        buttonRoots.add(r);
      }
    }
    const filtered = filterTriangles(coatRaw, (a, b, c) => {
      return !dropRoots.has(find(a)) && !dropRoots.has(find(b)) && !dropRoots.has(find(c));
    });
    // Mark button vertices in filtered mesh by spatial proximity to buttonRoots
    const btnKeys = new Set();
    for (const r of buttonRoots) {
      for (const vi of groups.get(r)) {
        btnKeys.add(
          `${Math.round(coatRaw.pos[vi * 3] * 2000)},${Math.round(coatRaw.pos[vi * 3 + 1] * 2000)},${Math.round(coatRaw.pos[vi * 3 + 2] * 2000)}`
        );
      }
    }
    for (let i = 0; i < filtered.pos.length / 3; i++) {
      const k = `${Math.round(filtered.pos[i * 3] * 2000)},${Math.round(filtered.pos[i * 3 + 1] * 2000)},${Math.round(filtered.pos[i * 3 + 2] * 2000)}`;
      if (btnKeys.has(k)) coatButtonVerts.add(i);
    }
    return filtered;
  })();

  // Find coat sleeve cuff reach so we keep ONLY visible body head/neck + hands/wrists
  let maxCoatX = 0;
  for (let i = 0; i < coatFiltered.pos.length; i += 3) {
    const ax = Math.abs(coatFiltered.pos[i]);
    if (ax > maxCoatX) maxCoatX = ax;
  }
  const wristKeepX = maxCoatX - 0.055; // small safe overlap inside sleeve cuff

  const bodyVisible = filterTriangles(bodyRaw, (a, b, c, pos) => {
    const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
    const cx = Math.abs((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3);
    // Keep head & neck above coat collar
    if (cy > joints.neck[1] - 0.055 && cx < 0.14) return true;
    // Keep sculpted hands + wrists beyond coat cuffs
    if (cx > wristKeepX && cy > 0.85 && cy < 1.15) return true;
    return false;
  });

  // Keep ONLY the central front chest & neck collar of top_knit so it never pokes through coat shoulders/back
  const knitVisible = filterTriangles(knitRaw, (a, b, c, pos) => {
    const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
    const cx = Math.abs((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3);
    const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    // Keep narrow neck ring + front V-neck chest panel only
    if (cy > joints.neck[1] - 0.035 && cx < 0.088) return true;
    return cy > 1.04 && cy < joints.neck[1] - 0.015 && cx < 0.105 && cz > -0.01;
  });

  // Gently inset knit edges under coat lapels so zero poke-through occurs at collar or shoulders
  for (let i = 0; i < knitVisible.pos.length / 3; i++) {
    const x = knitVisible.pos[i * 3];
    const y = knitVisible.pos[i * 3 + 1];
    const z = knitVisible.pos[i * 3 + 2];
    const edgeInset = smoothstep(0.055, 0.095, Math.abs(x)) * 0.008 + (z < 0.025 ? 0.006 : 0);
    if (edgeInset > 0) {
      knitVisible.pos[i * 3] -= knitVisible.norm[i * 3] * edgeInset;
      knitVisible.pos[i * 3 + 1] -= knitVisible.norm[i * 3 + 1] * edgeInset * 0.5;
      knitVisible.pos[i * 3 + 2] -= knitVisible.norm[i * 3 + 2] * edgeInset;
    }
    if (y > joints.neck[1] - 0.022 && Math.abs(x) < 0.072) {
      knitVisible.pos[i * 3 + 1] += 0.006;
    }
  }
  knitVisible.norm = recomputeSmoothNormals(knitVisible.pos, knitVisible.idx);

  // Inset slacks upper hip/back region beneath coat skirt so slacks never poke through coat back or sides
  slacksRaw.norm = recomputeSmoothNormals(slacksRaw.pos, slacksRaw.idx);
  for (let i = 0; i < slacksRaw.pos.length / 3; i++) {
    const y = slacksRaw.pos[i * 3 + 1];
    const inset = smoothstep(0.49, 0.66, y) * 0.011;
    if (inset > 0) {
      slacksRaw.pos[i * 3] -= slacksRaw.norm[i * 3] * inset;
      slacksRaw.pos[i * 3 + 2] -= slacksRaw.norm[i * 3 + 2] * inset;
    }
  }
  slacksRaw.norm = recomputeSmoothNormals(slacksRaw.pos, slacksRaw.idx);

  // Taper upper boot shaft (inside trouser hem, y > 0.085) slightly inward so boots never clip trouser ankles
  for (let i = 0; i < shoesRaw.pos.length / 3; i++) {
    const x = shoesRaw.pos[i * 3];
    const y = shoesRaw.pos[i * 3 + 1];
    const z = shoesRaw.pos[i * 3 + 2];
    const t = smoothstep(0.078, 0.145, y);
    if (t > 0) {
      const ankle = x >= 0 ? joints.ankleL : joints.ankleR;
      const pull = t * 0.22;
      shoesRaw.pos[i * 3] = x + (ankle[0] - x) * pull;
      shoesRaw.pos[i * 3 + 2] = z + (ankle[2] - z) * pull;
    }
  }
  coatRaw.norm = recomputeSmoothNormals(coatRaw.pos, coatRaw.idx);
  shoesRaw.norm = recomputeSmoothNormals(shoesRaw.pos, shoesRaw.idx);

  const parts = [
    {
      name: 'mannequin_body',
      kind: 'body',
      materialName: 'mat_porcelain_skin',
      mesh: bodyVisible,
      baseColorFactor: [0.85, 0.76, 0.68, 1],
      metallicFactor: 0.02,
      roughnessFactor: 0.56,
      doubleSided: false,
    },
    {
      name: 'mannequin_hair',
      kind: 'hair',
      materialName: 'mat_obsidian_hair',
      mesh: hairMesh,
      baseColorFactor: [0.11, 0.105, 0.115, 1],
      metallicFactor: 0.08,
      roughnessFactor: 0.42,
      doubleSided: true,
    },
    {
      name: 'garment_coat',
      kind: 'coat',
      materialName: 'mat_tailored_wool_coat',
      mesh: coatFiltered,
      baseColorFactor: [0.145, 0.145, 0.16, 1],
      metallicFactor: 0.04,
      roughnessFactor: 0.78,
      doubleSided: true,
    },
    {
      name: 'garment_knit',
      kind: 'knit',
      materialName: 'mat_merino_knit',
      mesh: knitVisible,
      baseColorFactor: [0.09, 0.09, 0.1, 1],
      metallicFactor: 0.02,
      roughnessFactor: 0.88,
      doubleSided: false,
    },
    {
      name: 'garment_slacks',
      kind: 'slacks',
      materialName: 'mat_worsted_slacks',
      mesh: { pos: slacksRaw.pos, norm: slacksRaw.norm, uv: slacksRaw.uv, idx: slacksRaw.idx },
      baseColorFactor: [0.12, 0.122, 0.135, 1],
      metallicFactor: 0.03,
      roughnessFactor: 0.82,
      doubleSided: true,
    },
    {
      name: 'garment_shoes',
      kind: 'shoes',
      materialName: 'mat_calfskin_boots',
      mesh: { pos: shoesRaw.pos, norm: shoesRaw.norm, uv: shoesRaw.uv, idx: shoesRaw.idx },
      baseColorFactor: [0.08, 0.08, 0.09, 1],
      metallicFactor: 0.16,
      roughnessFactor: 0.34,
      doubleSided: false,
    },
  ];

  // Compute 20-bone skinning weights for every part
  for (const part of parts) {
    part.skin = buildSkinAttributes(part.mesh, part.kind, joints);
  }

  // Bake soft ray-traced studio ambient occlusion into COLOR_0
  bakeStudioVertexAO(parts);

  // Accentuate tailored dark horn buttons on coat
  const coatPart = parts.find((p) => p.name === 'garment_coat');
  if (coatPart && coatPart.colorsBuf) {
    for (const vi of coatButtonVerts) {
      coatPart.colorsBuf[vi * 4] = Math.round(coatPart.colorsBuf[vi * 4] * 0.56);
      coatPart.colorsBuf[vi * 4 + 1] = Math.round(coatPart.colorsBuf[vi * 4 + 1] * 0.54);
      coatPart.colorsBuf[vi * 4 + 2] = Math.round(coatPart.colorsBuf[vi * 4 + 2] * 0.52);
    }
  }

  const bytes = writeSkinnedGlb(parts, joints, OUT_FILE);
  const totalVerts = parts.reduce((acc, p) => acc + p.mesh.pos.length / 3, 0);
  const totalTris = parts.reduce((acc, p) => acc + p.mesh.idx.length / 3, 0);

  process.stdout.write(
    `Built ${path.relative(REPO_ROOT, OUT_FILE)}: ${(bytes / 1024).toFixed(1)} KB | ${totalVerts} verts | ${totalTris} tris | ${BONE_SPECS.length} bones\n`
  );
  for (const p of parts) {
    process.stdout.write(
      `  - ${p.name.padEnd(16)} ${String(p.mesh.pos.length / 3).padStart(5)} verts  ${String(p.mesh.idx.length / 3).padStart(5)} tris\n`
    );
  }
}

main();
