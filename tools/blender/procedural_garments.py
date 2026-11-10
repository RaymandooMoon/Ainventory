"""
High-detail procedural garment & accessory builders for A inventory:
- `scarf`: Plush ribbed cashmere muffler with asymmetric front panels & individual fringe tassels
- `briefcase`: Structured executive leather briefcase (origin at top handle grip for hand socket + pendulum physics)
- `tote`: Structured pebbled leather shopper tote bag (origin at handle grip for hand socket + pendulum physics)
- `bag`: Structured saddle crossbody bag with curved front flap, metallic buckle & body-contouring strap
- `belt`: Calfskin leather belt with keeper loop, brushed silver frame buckle & prong
- `watch`: Minimalist dress watch with lugs, metallic bezel, ivory dial, hands & contoured strap
- `glasses`: Sculpted keyhole-bridge acetate eyewear with metallic pins & translucent optical lenses
- `briefs`: Second-skin seamless briefs

Material zone encoding via Vertex Color (`COLOR_0`):
- Zone 0 (Primary fabric/leather, tinted by item `color_hex`): grayscale `(ao, ao, ao)` where `r == g == b`
- Zone 1 (Brushed silver/champagne metal hardware): `(1.0, 0.08, 0.50)`
- Zone 2 (Watch ivory dial face): `(0.08, 1.0, 0.50)`
- Zone 3 (Translucent optical glass lens): `(0.08, 0.50, 1.0)`
"""
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector, Matrix

ZONE_METAL = (1.0, 0.08, 0.50, 1.0)
ZONE_DIAL = (0.08, 1.0, 0.50, 1.0)
ZONE_GLASS = (0.08, 0.50, 1.0, 1.0)


def zone_primary(ao=1.0):
    v = float(max(0.55, min(1.0, ao)))
    return (v, v, v, 1.0)


class NearestFit:
    """Bind each garment vertex to its 3 closest body vertices with inverse-distance weights."""
    def __init__(self, coords, base_H, body_idx):
        B = base_H[body_idx]
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


class RigidOriginFit:
    """Identity fit for handheld rigid/pendulum props (briefcase, tote) anchored at origin (0,0,0)."""
    def __init__(self, coords):
        self.coords = coords.copy()

    def fit(self, _H):
        return self.coords.copy()


def _tag_faces_color(bm, faces, rgba):
    col_layer = bm.loops.layers.color.verify()
    for f in faces:
        for loop in f.loops:
            loop[col_layer] = rgba


def _finalize_bmesh(name, bm):
    me = bpy.data.meshes.new(name)
    uv_layer = bm.loops.layers.uv.verify()
    col_layer = bm.loops.layers.color.verify()
    for f in bm.faces:
        f.smooth = True
        n = f.normal
        ax = np.argmax(np.abs([n.x, n.y, n.z]))
        for loop in f.loops:
            # Ensure default white if untagged
            c = loop[col_layer]
            if c[0] == 0.0 and c[1] == 0.0 and c[2] == 0.0:
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
            co = loop.vert.co
            if ax == 0:
                loop[uv_layer].uv = (co.y * 4.5, co.z * 4.5)
            elif ax == 1:
                loop[uv_layer].uv = (co.x * 4.5, co.z * 4.5)
            else:
                loop[uv_layer].uv = (co.x * 4.5, co.y * 4.5)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(bpy.data.materials.new(name))
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    return obj, co.reshape(-1, 3).astype(np.float64)


def _body_slice_ring(B, z0, dz=0.018, n_angles=48, pad=0.008):
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


def _add_grid_tube(bm, rings, closed=True, rgba=None, cap_ends=False):
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    R = len(rings)
    C = len(rings[0])
    created_faces = []
    for r in range(R - 1):
        for c in range(C if closed else C - 1):
            cn = (c + 1) % C
            try:
                f = bm.faces.new((verts[r][c], verts[r][cn], verts[r + 1][cn], verts[r + 1][c]))
                created_faces.append(f)
            except ValueError:
                pass
    if cap_ends and closed and len(verts) >= 2:
        try:
            created_faces.append(bm.faces.new(verts[0][::-1]))
            created_faces.append(bm.faces.new(verts[-1]))
        except ValueError:
            pass
    if rgba is not None:
        _tag_faces_color(bm, created_faces, rgba)
    return verts, created_faces


def _add_box(bm, center, size_xyz, rgba, bevel_segments=1, bevel_width=0.003):
    res = bmesh.ops.create_cube(
        bm,
        size=1.0,
        matrix=Matrix.Translation(center) @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0)),
    )
    verts = res["verts"]
    faces = list({f for v in verts for f in v.link_faces})
    if bevel_segments > 0 and bevel_width > 0:
        edges = list({e for f in faces for e in f.edges})
        bev = bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=bevel_width,
            offset_type="OFFSET",
            segments=bevel_segments,
            profile=0.5,
            affect="EDGES",
        )
        new_verts = bev.get("verts", [])
        faces = list({f for v in new_verts for f in v.link_faces} | set(bev.get("faces", [])))
    _tag_faces_color(bm, faces, rgba)
    return faces


def _add_arch_handle(bm, x0, x1, y0, z_base, z_peak, radius=0.0065, n_seg=22, n_cs=12, rgba=None):
    """Create a smooth rolled leather top handle arch from (x0, y0, z_base) to (x1, y0, z_base)."""
    rings = []
    ts = np.linspace(0.0, 1.0, n_seg)
    centers = []
    for t in ts:
        ang = t * math.pi
        cx = 0.5 * (x0 + x1) - 0.5 * (x1 - x0) * math.cos(ang)
        cz = z_base + (z_peak - z_base) * (math.sin(ang) ** 0.85)
        centers.append(np.array([cx, y0, cz]))
    for i, c in enumerate(centers):
        if i == 0:
            tang = centers[1] - centers[0]
        elif i == len(centers) - 1:
            tang = centers[-1] - centers[-2]
        else:
            tang = centers[i + 1] - centers[i - 1]
        tang = tang / max(np.linalg.norm(tang), 1e-8)
        up_y = np.array([0.0, 1.0, 0.0])
        in_vec = np.cross(tang, up_y)
        in_vec = in_vec / max(np.linalg.norm(in_vec), 1e-8)
        ths = np.linspace(0, 2 * math.pi, n_cs, endpoint=False)
        ring = c + radius * (np.cos(ths)[:, None] * up_y + np.sin(ths)[:, None] * in_vec)
        rings.append(ring)
    _add_grid_tube(bm, rings, closed=True, rgba=rgba or zone_primary(0.95), cap_ends=True)


def build_procedural(kind, base_H, body_idx, fc, basemesh):
    B = base_H[body_idx]
    bm = bmesh.new()

    if kind == "briefs":
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
        _tag_faces_color(bm_src, bm_src.faces[:], zone_primary(0.98))
        bm.free()
        obj, co = _finalize_bmesh("garment_underwear_briefs", bm_src)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "scarf":
        neck = fc.joint(base_H, "joint-neck")
        z_base = neck[2] + 0.008
        B_neck = B[np.abs(B[:, 0]) < 0.084]
        # 1. Plush double-wrapped cashmere neck collar with subtle organic folds
        n_u = 52
        n_v = 18
        base_ring = _body_slice_ring(B_neck, z_base + 0.012, dz=0.028, n_angles=n_u, pad=0.016)
        thetas = np.linspace(-math.pi, math.pi, n_u, endpoint=False)
        front_dip = np.clip(-np.sin(thetas), 0, 1)
        base_ring[:, 2] -= front_dip * 0.022
        base_ring[:, 1] -= front_dip * 0.010

        loop_rings = []
        for kv in range(n_v):
            phi = (kv / n_v) * 2.0 * math.pi
            fold_ripple = 0.0022 * math.sin(phi * 3.0)
            dr = 0.016 * (1.0 + 0.88 * math.cos(phi)) + fold_ripple
            dz = 0.028 * math.sin(phi)
            ring = base_ring.copy()
            rad = np.maximum(np.hypot(ring[:, 0], ring[:, 1]), 1e-4)
            ring[:, 0] += (ring[:, 0] / rad) * dr
            ring[:, 1] += (ring[:, 1] / rad) * dr
            ring[:, 2] += dz
            loop_rings.append(ring)
        loop_rings.append(loop_rings[0])
        _add_grid_tube(bm, loop_rings, closed=True, rgba=zone_primary(0.98))

        # 2. Two softly pleated wide cashmere front panels + delicate individual fringe tassels
        B_chest = B[np.abs(B[:, 0]) < 0.10]
        for side, x0, y_extra, len_t in [(-1, -0.034, -0.026, 0.27), (1, 0.030, -0.036, 0.32)]:
            tail_rings = []
            n_seg = 22
            ang_cs = np.linspace(0, 2 * math.pi, 24, endpoint=False)
            for s in np.linspace(0, 1, n_seg):
                z = z_base - 0.014 - s * len_t
                chest = _body_slice_ring(B_chest, z, dz=0.024, n_angles=32, pad=0.019)
                y_front = chest[:, 1].min() + y_extra - 0.007 * math.sin(s * math.pi)
                taper = math.sin(min(1.0, s * 5.5) * math.pi * 0.5) * (0.90 + 0.14 * s)
                w = (0.036 + 0.008 * s) * max(0.42, taper)
                # Subtle vertical pleat wave across the flat scarf blade
                pleat_y = 0.0024 * np.sin(ang_cs * 4.0) * (0.3 + 0.7 * s)
                th = 0.0075
                cx = x0 + side * 0.006 * math.sin(s * math.pi)
                pts = np.column_stack([
                    cx + w * np.cos(ang_cs),
                    y_front + th * np.sin(ang_cs) + pleat_y,
                    np.full_like(ang_cs, z),
                ])
                tail_rings.append(pts)
            _add_grid_tube(bm, tail_rings, closed=True, rgba=zone_primary(0.97), cap_ends=True)

            # 9 delicate twisted cashmere fringe tassels hanging below each hem!
            hem_z = z_base - 0.014 - len_t
            chest_hem = _body_slice_ring(B_chest, hem_z, dz=0.024, n_angles=32, pad=0.019)
            hem_y = chest_hem[:, 1].min() + y_extra
            hem_w = (0.036 + 0.008) * 1.02
            for fx in np.linspace(-hem_w * 0.86, hem_w * 0.86, 9):
                tassel_len = 0.034 + 0.004 * math.sin(fx * 90.0)
                t_rings = []
                th_f = np.linspace(0, 2 * math.pi, 6, endpoint=False)
                for ts_f in [0.0, 0.5, 1.0]:
                    rad_f = 0.0020 * (1.0 - 0.35 * ts_f)
                    zf = hem_z - ts_f * tassel_len
                    yf = hem_y - 0.0015 * ts_f
                    t_rings.append(np.column_stack([
                        x0 + fx + rad_f * np.cos(th_f),
                        yf + rad_f * np.sin(th_f),
                        np.full_like(th_f, zf),
                    ]))
                _add_grid_tube(bm, t_rings, closed=True, rgba=zone_primary(0.88), cap_ends=True)

        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.22)
        obj, co = _finalize_bmesh("garment_neckwear_scarf", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "briefcase":
        # Origin (0,0,0) = center of top handle grip (in Blender coords: X=thickness lateral to palm,
        # Y=front-to-back width along stride, Z=vertical up so negative Z hangs downward -> -Y in Three.js!)
        # Dimensions: 38cm wide (along Y: -0.19..+0.19), 28cm tall (Z: -0.085..-0.365), 9.5cm gusset (X: -0.048..+0.048)
        z_top = -0.088
        z_bot = -0.365
        z_mid = 0.5 * (z_top + z_bot)
        h_z = z_top - z_bot
        w_y = 0.38
        d_x = 0.094

        # 1. Main structured pebbled leather body
        _add_box(bm, (0.0, 0.0, z_mid), (d_x, w_y, h_z), zone_primary(0.96), bevel_segments=2, bevel_width=0.012)
        # 2. Front dual gusset pocket seam & top flap (outer face at +X so it faces outward away from leg!)
        _add_box(
            bm,
            (0.005, 0.0, z_top - 0.052),
            (d_x + 0.012, w_y + 0.006, 0.106),
            zone_primary(1.0),
            bevel_segments=2,
            bevel_width=0.009,
        )
        # Subtle vertical center seam strip on front lower body
        _add_box(bm, (d_x * 0.5 + 0.002, 0.0, z_bot + 0.085), (0.004, 0.006, 0.165), zone_primary(0.82), bevel_segments=1, bevel_width=0.001)

        # 3. Twin brushed silver push-lock clasps + leather tabs
        for sy in (-0.095, 0.095):
            # Leather strap tab above clasp
            _add_box(bm, (d_x * 0.5 + 0.007, sy, z_top - 0.088), (0.008, 0.032, 0.036), zone_primary(0.92), bevel_segments=1, bevel_width=0.003)
            # Brushed silver push-lock clasp plate
            _add_box(bm, (d_x * 0.5 + 0.009, sy, z_top - 0.114), (0.011, 0.030, 0.034), ZONE_METAL, bevel_segments=1, bevel_width=0.003)

        # 4. Four brushed silver handle D-ring anchors + Twin rolled leather top handles meeting at (0,0,0)
        for sx in (-0.020, 0.020):
            for sy in (-0.068, 0.068):
                _add_box(bm, (sx, sy, z_top + 0.007), (0.010, 0.018, 0.014), ZONE_METAL, bevel_segments=1, bevel_width=0.002)
            # Rolled arch along Y from sy=-0.068 to +0.068 peaking at z=0.0
            rings = []
            ts = np.linspace(0.0, 1.0, 22)
            centers = []
            for t in ts:
                ang = t * math.pi
                cy = -0.068 * math.cos(ang)
                cz = (z_top + 0.008) + (0.0 - (z_top + 0.008)) * (math.sin(ang) ** 0.82)
                cx = sx * (1.0 - 0.65 * math.sin(ang))  # converge slightly at grip apex!
                centers.append(np.array([cx, cy, cz]))
            for i, c in enumerate(centers):
                tang = (centers[min(len(centers) - 1, i + 1)] - centers[max(0, i - 1)])
                tang /= max(np.linalg.norm(tang), 1e-8)
                lat = np.array([1.0, 0.0, 0.0])
                nrm = np.cross(tang, lat)
                nrm /= max(np.linalg.norm(nrm), 1e-8)
                ths = np.linspace(0, 2 * math.pi, 12, endpoint=False)
                rings.append(c + 0.0072 * (np.cos(ths)[:, None] * lat + np.sin(ths)[:, None] * nrm))
            _add_grid_tube(bm, rings, closed=True, rgba=zone_primary(0.94), cap_ends=True)

        # Side shoulder-strap D-rings
        for sy in (-w_y * 0.5 - 0.004, w_y * 0.5 + 0.004):
            _add_box(bm, (0.0, sy, z_top - 0.028), (0.018, 0.010, 0.018), ZONE_METAL, bevel_segments=1, bevel_width=0.002)

        obj, co = _finalize_bmesh("garment_accessory_briefcase", bm)
        return obj, RigidOriginFit(co)

    if kind == "tote":
        # Structured pebbled leather shopper tote anchored at top handle grip (0,0,0)
        z_top = -0.155
        z_bot = -0.455
        n_rings = 9
        tote_rings = []
        for kz, z in enumerate(np.linspace(z_bot, z_top, n_rings)):
            t = kz / (n_rings - 1)
            # Slightly wider at top opening than base, like a luxury leather shopper tote
            w_x = 0.056 * (0.86 + 0.18 * t)
            w_y = 0.175 * (0.88 + 0.16 * t)
            th = np.linspace(0, 2 * math.pi, 32, endpoint=False)
            rx = w_x * np.sign(np.cos(th)) * (np.abs(np.cos(th)) ** 0.48)
            ry = w_y * np.sign(np.sin(th)) * (np.abs(np.sin(th)) ** 0.48)
            tote_rings.append(np.column_stack([rx, ry, np.full_like(th, z)]))
        _add_grid_tube(bm, tote_rings, closed=True, rgba=zone_primary(0.97), cap_ends=True)

        # Twin long flat leather handles rising to grip (0,0,0) + metallic rivets
        for sx in (-0.048, 0.048):
            for sy in (-0.072, 0.072):
                _add_box(bm, (sx * 1.08, sy, z_top - 0.022), (0.008, 0.014, 0.036), zone_primary(0.90), bevel_segments=1, bevel_width=0.002)
                _add_box(bm, (sx * 1.14, sy, z_top - 0.012), (0.006, 0.009, 0.009), ZONE_METAL, bevel_segments=1, bevel_width=0.001)
            rings = []
            ts = np.linspace(0.0, 1.0, 24)
            centers = []
            for t in ts:
                ang = t * math.pi
                cy = -0.072 * math.cos(ang)
                cz = (z_top - 0.005) + (0.0 - (z_top - 0.005)) * (math.sin(ang) ** 0.85)
                cx = sx * (1.0 - 0.72 * math.sin(ang))
                centers.append(np.array([cx, cy, cz]))
            for i, c in enumerate(centers):
                tang = (centers[min(len(centers) - 1, i + 1)] - centers[max(0, i - 1)])
                tang /= max(np.linalg.norm(tang), 1e-8)
                lat = np.array([1.0, 0.0, 0.0])
                nrm = np.cross(tang, lat)
                nrm /= max(np.linalg.norm(nrm), 1e-8)
                ths = np.linspace(0, 2 * math.pi, 10, endpoint=False)
                rings.append(c + np.cos(ths)[:, None] * lat * 0.0038 + np.sin(ths)[:, None] * nrm * 0.0085)
            _add_grid_tube(bm, rings, closed=True, rgba=zone_primary(0.94), cap_ends=True)

        obj, co = _finalize_bmesh("garment_accessory_tote", bm)
        return obj, RigidOriginFit(co)

    if kind == "bag":
        # Structured saddle crossbody bag beside the left hip + curved flap + silver buckle + strap
        hip_ring = _body_slice_ring(B, 0.86, dz=0.02, n_angles=36, pad=0.022)
        x_hip = hip_ring[:, 0].max() + 0.048
        z_bag = 0.80
        bag_rings = []
        for kz, z in enumerate(np.linspace(z_bag - 0.095, z_bag + 0.095, 9)):
            u = (kz - 4) / 4.0
            # Saddle curve: softly rounded bottom, crisp top
            s_y = 1.0 - (0.18 * u * u if u < 0 else 0.04 * u * u)
            w, d = 0.042 * (1.0 - 0.08 * u * u), 0.118 * s_y
            th = np.linspace(0, 2 * math.pi, 28, endpoint=False)
            rx = x_hip + w * np.sign(np.cos(th)) * (np.abs(np.cos(th)) ** 0.58)
            ry = -0.012 + d * np.sign(np.sin(th)) * (np.abs(np.sin(th)) ** 0.58)
            bag_rings.append(np.column_stack([rx, ry, np.full_like(th, z)]))
        _add_grid_tube(bm, bag_rings, closed=True, rgba=zone_primary(0.97), cap_ends=True)

        # Outer flap & gleaming silver clasp hardware on +X side
        _add_box(bm, (x_hip + 0.006, -0.012, z_bag + 0.038), (0.088, 0.215, 0.105), zone_primary(1.0), bevel_segments=2, bevel_width=0.010)
        _add_box(bm, (x_hip + 0.052, -0.012, z_bag - 0.008), (0.010, 0.034, 0.034), ZONE_METAL, bevel_segments=1, bevel_width=0.003)

        # Crossbody strap + metallic shoulder buckle
        sh_ring = _body_slice_ring(B, 1.34, dz=0.02, n_angles=36, pad=0.018)
        x_sh = sh_ring[:, 0].min() * 0.52
        strap_pts = []
        for t in np.linspace(0, 2 * math.pi, 52, endpoint=False):
            u = 0.5 * (1 - math.cos(t))
            x = x_hip * (1 - u) + x_sh * u
            z = (z_bag + 0.09) * (1 - u) + 1.365 * u
            ring = _body_slice_ring(B, z, dz=0.025, n_angles=36, pad=0.016)
            idx = np.argmin((ring[:, 0] - x) ** 2 + (ring[:, 1] - (0.09 * math.sin(t))) ** 2)
            p = ring[idx].copy()
            p[0] = x
            strap_pts.append(p)
        strap_pts = np.array(strap_pts)
        r1 = strap_pts + np.array([-0.012, -0.0025, 0])
        r2 = strap_pts + np.array([0.012, -0.0025, 0])
        r3 = strap_pts + np.array([0.012, 0.0030, 0])
        r4 = strap_pts + np.array([-0.012, 0.0030, 0])
        _add_grid_tube(bm, [r1, r2, r3, r4, r1], closed=True, rgba=zone_primary(0.93))
        obj, co = _finalize_bmesh("garment_accessory_bag", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "belt":
        z_waist = 0.995
        r_in_bot = _body_slice_ring(B, z_waist - 0.016, dz=0.018, n_angles=52, pad=0.004)
        r_out_bot = _body_slice_ring(B, z_waist - 0.016, dz=0.018, n_angles=52, pad=0.010)
        r_out_top = _body_slice_ring(B, z_waist + 0.016, dz=0.018, n_angles=52, pad=0.010)
        r_in_top = _body_slice_ring(B, z_waist + 0.016, dz=0.018, n_angles=52, pad=0.004)
        _add_grid_tube(bm, [r_in_bot, r_out_bot, r_out_top, r_in_top, r_in_bot], closed=True, rgba=zone_primary(0.96))

        # Brushed silver rectangular frame buckle + prong + leather keeper loop at front (-Y)
        y_front = r_out_bot[:, 1].min() - 0.004
        # Top, bottom, left, right frame bars of silver buckle
        _add_box(bm, (0.0, y_front, z_waist + 0.018), (0.052, 0.009, 0.007), ZONE_METAL, bevel_segments=1, bevel_width=0.0015)
        _add_box(bm, (0.0, y_front, z_waist - 0.018), (0.052, 0.009, 0.007), ZONE_METAL, bevel_segments=1, bevel_width=0.0015)
        _add_box(bm, (-0.023, y_front, z_waist), (0.007, 0.009, 0.040), ZONE_METAL, bevel_segments=1, bevel_width=0.0015)
        _add_box(bm, (0.023, y_front, z_waist), (0.007, 0.009, 0.040), ZONE_METAL, bevel_segments=1, bevel_width=0.0015)
        # Buckle prong
        _add_box(bm, (0.002, y_front - 0.003, z_waist), (0.026, 0.004, 0.004), ZONE_METAL, bevel_segments=1, bevel_width=0.001)
        # Leather keeper loop
        _add_box(bm, (0.042, y_front + 0.002, z_waist), (0.011, 0.012, 0.036), zone_primary(0.90), bevel_segments=1, bevel_width=0.002)

        obj, co = _finalize_bmesh("garment_accessory_belt", bm)
        return obj, NearestFit(co, base_H, body_idx)

    if kind == "watch":
        hand = fc.joint(base_H, "joint-l-hand")
        elbow = B[(B[:, 0] > 0.25) & (B[:, 2] > 1.05) & (B[:, 2] < 1.25)].mean(axis=0)
        wrist = hand * 0.82 + elbow * 0.18
        axis = hand - elbow
        axis /= np.linalg.norm(axis)
        up = np.array([0.0, -1.0, 0.0])
        u = np.cross(axis, up); u /= np.linalg.norm(u)
        v = np.cross(axis, u)
        d = np.linalg.norm(B - wrist, axis=1)
        near = B[d < 0.055] - wrist
        r_u = np.percentile(np.abs(near @ u), 90) + 0.003
        r_v = np.percentile(np.abs(near @ v), 90) + 0.003
        th = np.linspace(0, 2 * math.pi, 36, endpoint=False)
        circle = lambda ru, rv, da: wrist + da * axis + ru * np.cos(th)[:, None] * u + rv * np.sin(th)[:, None] * v
        # Contoured leather strap
        _add_grid_tube(bm, [
            circle(r_u, r_v, -0.010), circle(r_u + 0.0035, r_v + 0.0035, -0.010),
            circle(r_u + 0.0035, r_v + 0.0035, 0.010), circle(r_u, r_v, 0.010),
            circle(r_u, r_v, -0.010),
        ], closed=True, rgba=zone_primary(0.95))

        # Brushed steel watch case & bezel on wrist top (+v)
        case_c = wrist + (r_v + 0.0042) * v
        bezel_rings = []
        for s, h in [(0.0205, -0.003), (0.0215, 0.0035), (0.0180, 0.0055), (0.0172, 0.0040)]:
            bezel_rings.append(case_c + h * v + s * np.cos(th)[:, None] * u + s * np.sin(th)[:, None] * axis)
        _add_grid_tube(bm, bezel_rings, closed=True, rgba=ZONE_METAL)

        # Crisp ivory watch dial disk
        dial_rings = []
        for s, h in [(0.0172, 0.0044), (0.0008, 0.0046)]:
            dial_rings.append(case_c + h * v + s * np.cos(th)[:, None] * u + s * np.sin(th)[:, None] * axis)
        _add_grid_tube(bm, dial_rings, closed=True, rgba=ZONE_DIAL)

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

        for sign in (-1, 1):
            cx = sign * ed * 0.52
            th = np.linspace(0, 2 * math.pi, 32, endpoint=False)
            rx = np.sign(np.cos(th)) * (np.abs(np.cos(th)) ** 0.68)
            rz = np.sign(np.sin(th)) * (np.abs(np.sin(th)) ** 0.68)
            w_in, h_in = ed * 0.34, ed * 0.27
            w_out, h_out = ed * 0.43, ed * 0.36
            in_f = np.column_stack([cx + w_in * rx, np.full_like(th, y_front - 0.0045), z0 + h_in * rz])
            out_f = np.column_stack([cx + w_out * rx, np.full_like(th, y_front - 0.0045), z0 + h_out * rz])
            out_b = np.column_stack([cx + w_out * rx, np.full_like(th, y_front + 0.0020), z0 + h_out * rz])
            in_b = np.column_stack([cx + w_in * rx, np.full_like(th, y_front + 0.0020), z0 + h_in * rz])
            _add_grid_tube(bm, [in_f, out_f, out_b, in_b, in_f], closed=True, rgba=zone_primary(0.95))

            # Translucent optical glass lens inside each rim!
            lens_outer = np.column_stack([cx + w_in * 0.99 * rx, np.full_like(th, y_front - 0.0015), z0 + h_in * 0.99 * rz])
            lens_inner = np.column_stack([cx + w_in * 0.03 * rx, np.full_like(th, y_front - 0.0025), z0 + h_in * 0.03 * rz])
            _add_grid_tube(bm, [lens_outer, lens_inner], closed=True, rgba=ZONE_GLASS)

            # Temple arm + silver corner rivet pin
            tx = cx + sign * w_out * 0.95
            _add_box(bm, (tx, y_front + 0.052, z0 + 0.004), (0.0042, 0.106, 0.0065), zone_primary(0.92), bevel_segments=1, bevel_width=0.001)
            _add_box(bm, (cx + sign * w_out * 0.86, y_front - 0.005, z0 + h_out * 0.58), (0.006, 0.003, 0.003), ZONE_METAL, bevel_segments=0, bevel_width=0)

        # Keyhole nose bridge
        _add_box(bm, (0, y_front - 0.0025, z0 + ed * 0.09), (ed * 0.25, 0.0055, 0.0055), zone_primary(0.96), bevel_segments=1, bevel_width=0.001)
        obj, co = _finalize_bmesh("garment_accessory_glasses", bm)
        return obj, NearestFit(co, base_H, body_idx)

    raise ValueError("Unknown procedural garment: " + str(kind))


def extend_coat(coords):
    """Stretch the lower hem of the double-breasted suit jacket into a knee-length overcoat."""
    out = coords.copy()
    z = out[:, 2]
    trunk = (z < 1.10) & (np.abs(out[:, 0]) < 0.23)
    t = np.clip((1.10 - z[trunk]) / 0.28, 0.0, 1.0)
    out[trunk, 2] = z[trunk] - (t ** 1.12) * 0.32
    flare_x = 1.0 + (t ** 1.05) * 0.18
    flare_y = 1.0 + (t ** 1.05) * 0.16
    out[trunk, 0] *= flare_x
    out[trunk, 1] *= flare_y
    y_tr = out[trunk, 1]
    back_factor = np.clip(y_tr / 0.08, 0.0, 1.0)
    glute_arch = np.sin(np.clip(t * 1.15, 0.0, 1.0) * math.pi)
    out[trunk, 1] += back_factor * (0.038 * glute_arch + 0.032 * t)
    return out
