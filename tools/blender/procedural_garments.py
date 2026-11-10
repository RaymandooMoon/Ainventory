"""
Procedural garment builders for slots that do not have a standalone MakeHuman mesh
(`scarf`, `briefs`, `belt`, `bag`, `watch`, `glasses`) plus the `extend_coat` modifier.

Every procedural mesh is bound to its nearest body vertices so that `NearestFit.fit(H)`
propagates all 29 body morphs (gender, weight, muscle, bust, waist, hips, neck, head, etc.)
to the garment identically to MakeHuman's `.mhclo` fitting.
"""
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector, Matrix


class NearestFit:
    """Bind each garment vertex to its 3 closest body vertices with inverse-distance weights."""
    def __init__(self, coords, base_H, body_idx):
        B = base_H[body_idx]
        # vectorised k=3 nearest in chunks
        n = len(coords)
        v = np.zeros((n, 3), dtype=np.int64)
        w = np.zeros((n, 3))
        for start in range(0, n, 256):
            end = min(n, start + 256)
            d2 = np.sum((coords[start:end, None, :] - B[None, :, :]) ** 2, axis=2)
            idx = np.argpartition(d2, 3, axis=1)[:, :3]
            dist = np.sqrt(np.maximum(np.take_along_axis(d2, idx, axis=1), 1e-12))
            inv = 1.0 / (dist + 1e-4)
            inv /= inv.sum(axis=1, keepdims=True)
            v[start:end] = body_idx[idx]
            w[start:end] = inv
        self.v = v
        self.w = w
        ref = (w[:, 0:1] * base_H[v[:, 0]] + w[:, 1:2] * base_H[v[:, 1]] + w[:, 2:3] * base_H[v[:, 2]])
        self.offset = coords - ref

    def fit(self, H):
        ref = (self.w[:, 0:1] * H[self.v[:, 0]] + self.w[:, 1:2] * H[self.v[:, 1]] + self.w[:, 2:3] * H[self.v[:, 2]])
        return ref + self.offset


def _finalize_bmesh(name, bm):
    me = bpy.data.meshes.new(name)
    # simple planar/box UV projection so fabric bump textures tile cleanly
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.smooth = True
        n = f.normal
        ax = np.argmax(np.abs([n.x, n.y, n.z]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 0:
                loop[uv_layer].uv = (co.y * 4.0, co.z * 4.0)
            elif ax == 1:
                loop[uv_layer].uv = (co.x * 4.0, co.z * 4.0)
            else:
                loop[uv_layer].uv = (co.x * 4.0, co.y * 4.0)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(bpy.data.materials.new(name))
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    return obj, co.reshape(-1, 3).astype(np.float64)


def _body_slice_ring(B, z0, dz=0.018, n_angles=48, pad=0.008):
    """Sample the outer contour of the body at height z0 in `n_angles` directions."""
    m = np.abs(B[:, 2] - z0) < dz
    pts = B[m]
    ang = np.arctan2(pts[:, 1], pts[:, 0])
    rad = np.hypot(pts[:, 0], pts[:, 1])
    thetas = np.linspace(-math.pi, math.pi, n_angles, endpoint=False)
    out = np.zeros((n_angles, 3))
    for i, th in enumerate(thetas):
        da = np.abs((ang - th + math.pi) % (2 * math.pi) - math.pi)
        sel = da < (2 * math.pi / n_angles) * 1.6
        r = np.percentile(rad[sel], 92) if np.any(sel) else 0.12
        r += pad
        out[i] = [r * math.cos(th), r * math.sin(th), z0]
    return out


def _add_grid_tube(bm, rings, closed=True):
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    R = len(rings)
    C = len(rings[0])
    for r in range(R - 1):
        for c in range(C if closed else C - 1):
            cn = (c + 1) % C
            bm.faces.new((verts[r][c], verts[r][cn], verts[r + 1][cn], verts[r + 1][c]))
    return verts


def build_procedural(kind, base_H, body_idx, fc, basemesh):
    B = base_H[body_idx]
    bm = bmesh.new()

    if kind == "briefs":
        # Second-skin briefs extracted directly from the pelvis/hip region of the human body
        z_pelvis = B[:, 2]
        keep_mask = (z_pelvis > 0.755) & (z_pelvis < 0.945) & (np.abs(B[:, 0]) < 0.19)
        keep_full = np.zeros(len(base_H), dtype=bool)
        keep_full[body_idx[keep_mask]] = True
        me_src = basemesh.data
        bm_src = bmesh.new()
        bm_src.from_mesh(me_src)
        bm_src.verts.ensure_lookup_table()
        for v in bm_src.verts:
            v.co = Vector(base_H[v.index])
        bmesh.ops.delete(bm_src, geom=[v for v in bm_src.verts if not keep_full[v.index]], context="VERTS")
        bm_src.normal_update()
        for v in bm_src.verts:
            v.co += v.normal * 0.0025
        bm.free()
        obj, co = _finalize_bmesh("garment_underwear_briefs", bm_src)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "scarf":
        neck = fc.joint(base_H, "joint-neck")
        z_base = neck[2] + 0.006
        B_neck = B[np.abs(B[:, 0]) < 0.082]
        # Cozy cashmere muffler torus-tube wrapped around the neck
        n_u = 44
        n_v = 14
        base_ring = _body_slice_ring(B_neck, z_base + 0.012, dz=0.028, n_angles=n_u, pad=0.016)
        thetas = np.linspace(-math.pi, math.pi, n_u, endpoint=False)
        front_dip = np.clip(- np.sin(thetas), 0, 1)
        base_ring[:, 2] -= front_dip * 0.020
        base_ring[:, 1] -= front_dip * 0.008

        loop_rings = []
        for kv in range(n_v):
            phi = (kv / n_v) * 2.0 * math.pi
            # radial offset (outward from neck) and vertical offset
            dr = 0.014 * (1.0 + 0.85 * math.cos(phi))
            dz = 0.024 * math.sin(phi)
            ring = base_ring.copy()
            rad = np.maximum(np.hypot(ring[:, 0], ring[:, 1]), 1e-4)
            ring[:, 0] += (ring[:, 0] / rad) * dr
            ring[:, 1] += (ring[:, 1] / rad) * dr
            ring[:, 2] += dz
            loop_rings.append(ring)
        loop_rings.append(loop_rings[0])
        _add_grid_tube(bm, loop_rings, closed=True)

        # Two softly rounded front tails hanging over the chest (-Y is front)
        B_chest = B[np.abs(B[:, 0]) < 0.095]
        for side, x0, y_extra, len_t in [(-1, -0.032, -0.024, 0.25), (1, 0.028, -0.032, 0.28)]:
            tail_rings = []
            n_seg = 16
            for ks, s in enumerate(np.linspace(0, 1, n_seg)):
                z = z_base - 0.012 - s * len_t
                chest = _body_slice_ring(B_chest, z, dz=0.024, n_angles=32, pad=0.018)
                y_front = chest[:, 1].min() + y_extra - 0.005 * math.sin(s * math.pi)
                taper = math.sin(min(1.0, s * 6.0) * math.pi * 0.5) * (0.92 + 0.08 * s)
                w = (0.030 + 0.005 * s) * max(0.35, taper)
                th = 0.0085
                cx = x0 + side * 0.004 * math.sin(s * math.pi)
                ang_cs = np.linspace(0, 2 * math.pi, 16, endpoint=False)
                pts = np.column_stack([
                    cx + w * np.cos(ang_cs),
                    y_front + th * np.sin(ang_cs),
                    np.full_like(ang_cs, z),
                ])
                tail_rings.append(pts)
            verts_t = _add_grid_tube(bm, tail_rings, closed=True)
            bm.faces.new(verts_t[0][::-1])
            bm.faces.new(verts_t[-1])
        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.35)
        obj, co = _finalize_bmesh("garment_neckwear_scarf", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "belt":
        z_waist = 0.995
        r_in_bot = _body_slice_ring(B, z_waist - 0.016, dz=0.018, n_angles=48, pad=0.004)
        r_out_bot = _body_slice_ring(B, z_waist - 0.016, dz=0.018, n_angles=48, pad=0.010)
        r_out_top = _body_slice_ring(B, z_waist + 0.016, dz=0.018, n_angles=48, pad=0.010)
        r_in_top = _body_slice_ring(B, z_waist + 0.016, dz=0.018, n_angles=48, pad=0.004)
        _add_grid_tube(bm, [r_in_bot, r_out_bot, r_out_top, r_in_top, r_in_bot], closed=True)
        # front buckle at -Y
        y_front = r_out_bot[:, 1].min() - 0.003
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, y_front, z_waist)) @ Matrix.Diagonal((0.046, 0.008, 0.038, 1)))
        obj, co = _finalize_bmesh("garment_accessory_belt", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "bag":
        # Structured leather crossbody bag beside the left hip + strap over right shoulder
        hip_ring = _body_slice_ring(B, 0.86, dz=0.02, n_angles=36, pad=0.02)
        x_hip = hip_ring[:, 0].max() + 0.045
        z_bag = 0.80
        # rounded rectangular bag body
        bag_rings = []
        for kz, z in enumerate(np.linspace(z_bag - 0.11, z_bag + 0.11, 7)):
            s = 1.0 - 0.08 * ((kz - 3) / 3.0) ** 2
            w, d = 0.038 * s, 0.105 * s
            th = np.linspace(0, 2 * math.pi, 24, endpoint=False)
            rx = x_hip + w * np.sign(np.cos(th)) * (np.abs(np.cos(th)) ** 0.55)
            ry = -0.01 + d * np.sign(np.sin(th)) * (np.abs(np.sin(th)) ** 0.55)
            bag_rings.append(np.column_stack([rx, ry, np.full_like(th, z)]))
        verts = _add_grid_tube(bm, bag_rings, closed=True)
        bm.faces.new(verts[0][::-1])
        bm.faces.new(verts[-1])
        # crossbody strap from bag top around right shoulder
        sh_ring = _body_slice_ring(B, 1.34, dz=0.02, n_angles=36, pad=0.016)
        x_sh = sh_ring[:, 0].min() * 0.52
        strap_pts = []
        for t in np.linspace(0, 2 * math.pi, 48, endpoint=False):
            u = 0.5 * (1 - math.cos(t))
            x = x_hip * (1 - u) + x_sh * u
            z = (z_bag + 0.10) * (1 - u) + 1.36 * u
            ring = _body_slice_ring(B, z, dz=0.025, n_angles=36, pad=0.014)
            idx = np.argmin((ring[:, 0] - x) ** 2 + (ring[:, 1] - (0.09 * math.sin(t))) ** 2)
            p = ring[idx].copy()
            p[0] = x
            strap_pts.append(p)
        strap_pts = np.array(strap_pts)
        r1 = strap_pts + np.array([-0.011, -0.002, 0])
        r2 = strap_pts + np.array([0.011, -0.002, 0])
        r3 = strap_pts + np.array([0.011, 0.003, 0])
        r4 = strap_pts + np.array([-0.011, 0.003, 0])
        _add_grid_tube(bm, [r1, r2, r3, r4, r1], closed=True)
        obj, co = _finalize_bmesh("garment_accessory_bag", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "watch":
        hand = fc.joint(base_H, "joint-l-hand")
        elbow = B[(B[:, 0] > 0.25) & (B[:, 2] > 1.05) & (B[:, 2] < 1.25)].mean(axis=0)
        wrist = hand * 0.82 + elbow * 0.18
        axis = hand - elbow
        axis /= np.linalg.norm(axis)
        # local frame around the wrist axis
        up = np.array([0.0, -1.0, 0.0])
        u = np.cross(axis, up); u /= np.linalg.norm(u)
        v = np.cross(axis, u)
        d = np.linalg.norm(B - wrist, axis=1)
        near = B[d < 0.055] - wrist
        r_u = np.percentile(np.abs(near @ u), 90) + 0.003
        r_v = np.percentile(np.abs(near @ v), 90) + 0.003
        th = np.linspace(0, 2 * math.pi, 32, endpoint=False)
        circle = lambda ru, rv, da: wrist + da * axis + ru * np.cos(th)[:, None] * u + rv * np.sin(th)[:, None] * v
        _add_grid_tube(bm, [
            circle(r_u, r_v, -0.009), circle(r_u + 0.003, r_v + 0.003, -0.009),
            circle(r_u + 0.003, r_v + 0.003, 0.009), circle(r_u, r_v, 0.009),
            circle(r_u, r_v, -0.009),
        ], closed=True)
        # watch case on the top/front of the wrist (+v)
        case_c = wrist + (r_v + 0.004) * v
        c_rings = []
        for s, h in [(0.019, -0.003), (0.020, 0.003), (0.016, 0.005), (0.001, 0.005)]:
            c_rings.append(case_c + h * v + s * np.cos(th)[:, None] * u + s * np.sin(th)[:, None] * axis)
        _add_grid_tube(bm, c_rings, closed=True)
        obj, co = _finalize_bmesh("garment_accessory_watch", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "glasses":
        eye_l = fc.joint(base_H, "joint-l-eye")
        eye_r = fc.joint(base_H, "joint-r-eye")
        mid = (eye_l + eye_r) / 2
        ed = np.linalg.norm(eye_l - eye_r)
        head_pts = B[B[:, 2] > mid[2] - ed * 0.4]
        y_front = head_pts[np.abs(head_pts[:, 0]) < ed * 0.7, 1].min() - 0.006
        z0 = mid[2]
        # two rounded-square acetate rims + nose bridge + temples
        for sign in (-1, 1):
            cx = sign * ed * 0.52
            th = np.linspace(0, 2 * math.pi, 28, endpoint=False)
            rx = np.sign(np.cos(th)) * (np.abs(np.cos(th)) ** 0.65)
            rz = np.sign(np.sin(th)) * (np.abs(np.sin(th)) ** 0.65)
            w_in, h_in = ed * 0.34, ed * 0.27
            w_out, h_out = ed * 0.42, ed * 0.35
            in_f = np.column_stack([cx + w_in * rx, np.full_like(th, y_front - 0.004), z0 + h_in * rz])
            out_f = np.column_stack([cx + w_out * rx, np.full_like(th, y_front - 0.004), z0 + h_out * rz])
            out_b = np.column_stack([cx + w_out * rx, np.full_like(th, y_front + 0.002), z0 + h_out * rz])
            in_b = np.column_stack([cx + w_in * rx, np.full_like(th, y_front + 0.002), z0 + h_in * rz])
            _add_grid_tube(bm, [in_f, out_f, out_b, in_b, in_f], closed=True)
            # temple arm going back (+Y) toward ear
            tx = cx + sign * w_out * 0.95
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((tx, y_front + 0.052, z0 + 0.004)) @ Matrix.Diagonal((0.004, 0.105, 0.006, 1)))
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, y_front - 0.002, z0 + ed * 0.08)) @ Matrix.Diagonal((ed * 0.24, 0.005, 0.005, 1)))
        obj, co = _finalize_bmesh("garment_accessory_glasses", bm)
        return obj, NearestFit(co, base_H, body_idx)

    raise ValueError("Unknown procedural garment: " + str(kind))


def extend_coat(coords):
    """Stretch the lower hem of the double-breasted suit jacket into a knee-length overcoat."""
    out = coords.copy()
    z = out[:, 2]
    # jacket trunk vertices (exclude sleeves which have |x| > 0.22)
    trunk = (z < 1.10) & (np.abs(out[:, 0]) < 0.23)
    t = np.clip((1.10 - z[trunk]) / 0.28, 0.0, 1.0)
    out[trunk, 2] = z[trunk] - (t ** 1.12) * 0.32
    # subtle A-line flare so the coat clears the hips and trousers cleanly
    flare_x = 1.0 + (t ** 1.05) * 0.18
    flare_y = 1.0 + (t ** 1.05) * 0.16
    out[trunk, 0] *= flare_x
    out[trunk, 1] *= flare_y
    # Fill in the lumbar concavity on the back (+Y) so the coat hangs smoothly over the glutes
    y_tr = out[trunk, 1]
    back_factor = np.clip(y_tr / 0.08, 0.0, 1.0)
    glute_arch = np.sin(np.clip(t * 1.15, 0.0, 1.0) * math.pi)
    out[trunk, 1] += back_factor * (0.038 * glute_arch + 0.032 * t)
    return out
