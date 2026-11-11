"""
A inventory — realistic mannequin asset builder (Blender 4.2 + MPFB2, headless).

Builds a faceless, game-quality human mannequin from the CC0 MakeHuman base mesh and
CC0 MakeHuman community clothes, bakes every body-shape control as a glTF morph target
(on the body AND on each fitted garment, so garments follow the body in real time) and
exports compressed-ready GLB files + a manifest consumed by
`src/utils/mannequin3DRenderer.js`.

Usage (from repo root):
  blender -b --python tools/blender/build_mannequin.py -- \
      --assets ~/tools/assets/mh --out public/models/mannequin [--only top_tshirt,shoes_sneakers]

Licensing: MakeHuman base mesh, targets and the listed community assets are CC0.
MPFB itself (GPL) is only used as a build tool; its output is not covered by the GPL.
"""
import bpy
import bmesh
import numpy as np
import json
import os
import sys
import math
import argparse
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from garment_catalog import GARMENTS  # noqa: E402
from procedural_garments import build_procedural, extend_coat  # noqa: E402

from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService  # noqa: E402
from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo  # noqa: E402
from bl_ext.user_default.mpfb.entities.objectproperties import HumanObjectProperties  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--assets", default=os.path.expanduser("~/tools/assets/mh"))
    p.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(HERE)), "public", "models", "mannequin"))
    p.add_argument("--only", default="")
    p.add_argument("--no-garments", action="store_true")
    p.add_argument("--blend", default="")
    return p.parse_args(argv)


ARGS = parse_args()
TARGET_DIR = LocationService.get_mpfb_data("targets")

# Neutral young-adult base. Gender is a morph (gender_female / gender_male) so a single
# body + garment set serves every profile.
BASE_MACRO = {
    "gender": 0.5, "age": 0.5, "muscle": 0.5, "weight": 0.5, "proportions": 0.75,
    "height": 0.5, "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.6, "caucasian": 0.3, "african": 0.1},
}

# name: (macro overrides, detail targets {path: weight}, reference macro overrides)
# delta = state - reference ; reference defaults to the neutral base.
FEMALE = {"gender": 0.0}
MALE = {"gender": 1.0}
MORPHS = [
    ("gender_female", FEMALE, {}, None),
    ("gender_male", MALE, {}, None),
    ("weight_up", {"weight": 1.0}, {}, None),
    ("weight_down", {"weight": 0.0}, {}, None),
    ("muscle_up", {"muscle": 1.0}, {}, None),
    ("muscle_down", {"muscle": 0.0}, {}, None),
    ("age_old", {"age": 0.875}, {}, None),
    ("bust_up", {"gender": 0.0, "cupsize": 1.0}, {}, FEMALE),
    ("bust_down", {"gender": 0.0, "cupsize": 0.0}, {}, FEMALE),
    ("shoulder_up", {}, {"torso/measure-shoulder-dist-incr": 1.0}, None),
    ("shoulder_down", {}, {"torso/measure-shoulder-dist-decr": 1.0}, None),
    ("chest_up", {}, {"torso/measure-bust-circ-incr": 1.0}, None),
    ("chest_down", {}, {"torso/measure-bust-circ-decr": 1.0}, None),
    ("waist_up", {}, {"torso/measure-waist-circ-incr": 1.0}, None),
    ("waist_down", {}, {"torso/measure-waist-circ-decr": 1.0}, None),
    ("belly_up", {}, {"stomach/stomach-pregnant-incr": 0.6}, None),
    ("belly_down", {}, {"stomach/stomach-pregnant-decr": 1.0}, None),
    ("hips_up", {}, {"torso/measure-hips-circ-incr": 1.0}, None),
    ("hips_down", {}, {"torso/measure-hips-circ-decr": 1.0}, None),
    ("thigh_up", {}, {"legs/measure-thigh-circ-incr": 1.0}, None),
    ("thigh_down", {}, {"legs/measure-thigh-circ-decr": 1.0}, None),
    ("calf_up", {}, {"legs/measure-calf-circ-incr": 1.0}, None),
    ("calf_down", {}, {"legs/measure-calf-circ-decr": 1.0}, None),
    ("arm_up", {}, {"arms/measure-upperarm-circ-incr": 1.0}, None),
    ("arm_down", {}, {"arms/measure-upperarm-circ-decr": 1.0}, None),
    ("neck_up", {}, {"neck/measure-neck-circ-incr": 1.0}, None),
    ("neck_down", {}, {"neck/measure-neck-circ-decr": 1.0}, None),
    ("head_up", {}, {"head/head-scale-depth-incr": 1.0, "head/head-scale-horiz-incr": 1.0, "head/head-scale-vert-incr": 1.0}, None),
    ("head_down", {}, {"head/head-scale-depth-decr": 1.0, "head/head-scale-horiz-decr": 1.0, "head/head-scale-vert-decr": 1.0}, None),
]


# ----------------------------------------------------------------------------------------------
# Human state evaluation
# ----------------------------------------------------------------------------------------------
def shape_key_coords(key_block, n):
    arr = np.empty(n * 3, dtype=np.float64)
    key_block.data.foreach_get("co", arr)
    return arr.reshape(n, 3)


def mix_coords(obj):
    n = len(obj.data.vertices)
    kbs = obj.data.shape_keys.key_blocks
    basis = shape_key_coords(kbs[0], n)
    total = basis.copy()
    for kb in kbs[1:]:
        if kb.mute or abs(kb.value) < 1e-6:
            continue
        total += kb.value * (shape_key_coords(kb, n) - basis)
    return total


def evaluate_state(basemesh, macro_overrides, targets):
    macro = json.loads(json.dumps(BASE_MACRO))
    macro.update({k: v for k, v in macro_overrides.items()})
    for key, value in macro.items():
        if key == "race":
            for rk, rv in value.items():
                HumanObjectProperties.set_value(rk, rv, entity_reference=basemesh)
        else:
            HumanObjectProperties.set_value(key, value, entity_reference=basemesh)
    TargetService.reapply_macro_details(basemesh)
    loaded = []
    for rel, weight in targets.items():
        path = os.path.join(TARGET_DIR, rel + ".target.gz")
        sk = TargetService.load_target(basemesh, path, weight=weight, name="tmp_" + rel.replace("/", "_"))
        loaded.append(sk)
    coords = mix_coords(basemesh)
    for sk in loaded:
        basemesh.shape_key_remove(sk)
    return coords


# ----------------------------------------------------------------------------------------------
# Faceless head: replace facial features with a smooth fitted surface (radial SH fit)
# ----------------------------------------------------------------------------------------------
def group_vertices(basemesh, name):
    idx = basemesh.vertex_groups[name].index
    return np.array([v.index for v in basemesh.data.vertices if any(g.group == idx and g.weight > 0.5 for g in v.groups)], dtype=np.int64)


class FaceContext:
    def __init__(self, basemesh, body_idx):
        self.body_idx = body_idx
        self.groups = {}
        for g in ("joint-head", "joint-head-2", "joint-l-eye", "joint-r-eye", "joint-mouth", "joint-neck", "joint-jaw", "joint-l-hand", "joint-l-elbow"):
            try:
                self.groups[g] = group_vertices(basemesh, g)
            except KeyError:
                pass
        # adjacency on body vertices (for interior/exterior + feathering)
        me = basemesh.data
        n = len(me.vertices)
        edges = np.empty(len(me.edges) * 2, dtype=np.int64)
        me.edges.foreach_get("vertices", edges)
        self.edges = edges.reshape(-1, 2)
        self.n = n
        tris = []
        for poly in me.polygons:
            vs = list(poly.vertices)
            for k in range(1, len(vs) - 1):
                tris.append((vs[0], vs[k], vs[k + 1]))
        self.tris = np.array(tris, dtype=np.int64)
        self.zone_state = None

    def vertex_normals(self, coords):
        a, b, c = coords[self.tris[:, 0]], coords[self.tris[:, 1]], coords[self.tris[:, 2]]
        fn = np.cross(b - a, c - a)
        vn = np.zeros_like(coords)
        for k in range(3):
            np.add.at(vn, self.tris[:, k], fn)
        return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)

    def joint(self, coords, name):
        return coords[self.groups[name]].mean(axis=0)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def tps_fit(xy, values, reg=1e-4):
    """2D thin-plate spline: returns evaluator f(xy_query)."""
    n = len(xy)
    d = np.linalg.norm(xy[:, None, :] - xy[None, :, :], axis=2)
    with np.errstate(divide="ignore", invalid="ignore"):
        K = np.where(d > 0, d * d * np.log(d), 0.0)
    K += np.eye(n) * reg
    P = np.hstack([np.ones((n, 1)), xy])
    A = np.zeros((n + 3, n + 3))
    A[:n, :n] = K
    A[:n, n:] = P
    A[n:, :n] = P.T
    b = np.concatenate([values, np.zeros(3)])
    sol = np.linalg.solve(A, b)
    w, a = sol[:n], sol[n:]

    def f(q):
        dq = np.linalg.norm(q[:, None, :] - xy[None, :, :], axis=2)
        with np.errstate(divide="ignore", invalid="ignore"):
            Kq = np.where(dq > 0, dq * dq * np.log(dq), 0.0)
        return Kq @ w + a[0] + q @ a[1:]
    return f


def make_faceless(coords, fc, interior_body=None):
    """Sculpt eyes / brows / nose / lips away: the front of the face becomes a smooth,
    minimal-bending surface (thin-plate spline height field) interpolated from the
    surrounding forehead, temples, cheeks and chin — like a high-end boutique mannequin."""
    out = coords.copy()
    body = fc.body_idx
    eye_l = fc.joint(coords, "joint-l-eye")
    eye_r = fc.joint(coords, "joint-r-eye")
    mouth = fc.joint(coords, "joint-mouth")
    eyes_mid = (eye_l + eye_r) / 2
    ed = np.linalg.norm(eye_l - eye_r)  # inter-pupil distance (~6 cm)

    P = coords[body]
    # face-local frame: x = lateral, z = vertical; MakeHuman faces -Y in Blender
    cx = 0.0
    top = eyes_mid[2] + ed * 0.62          # just above the brow ridge
    bottom = eyes_mid[2] - ed * 1.62       # between lower lip and chin point
    cz = (top + bottom) / 2
    hw, hh = ed * 0.98, (top - bottom) / 2  # feature ellipse half extents
    nx = (P[:, 0] - cx) / hw
    nz = (P[:, 2] - cz) / hh
    r = np.sqrt(nx ** 2 + nz ** 2)
    head_front = (P[:, 1] < eyes_mid[1] + ed * 0.75) & (P[:, 2] > eyes_mid[2] - ed * 2.6)

    ring = head_front & (P[:, 1] < eyes_mid[1] + ed * 0.1) & (r > 1.0) & (r < 1.35)
    ring_idx = np.where(ring)[0]
    # outermost surface only: for the ring keep vertices that are frontmost in their (x,z) cell
    cell = np.floor(P[ring_idx][:, [0, 2]] / (ed * 0.09)).astype(np.int64)
    order = np.lexsort((P[ring_idx, 1], cell[:, 1], cell[:, 0]))
    seen, ctrl = set(), []
    for i in order:
        key = (cell[i, 0], cell[i, 1])
        if key in seen:
            continue
        seen.add(key)
        ctrl.append(ring_idx[i])
    ctrl = np.array(ctrl)
    xy = P[ctrl][:, [0, 2]] / ed
    f = tps_fit(xy, P[ctrl, 1] / ed, reg=2e-3)

    if fc.zone_state is None:
        # decided once on the neutral state, reused for every morph state (consistent topology use)
        local = -np.ones(fc.n, dtype=np.int64)
        local[body] = np.arange(len(body))
        e = local[fc.edges]
        e = e[(e[:, 0] >= 0) & (e[:, 1] >= 0)]
        # Cut along the front face ellipse (r < 0.9); anything not reachable from the feet
        # (including deep eye sockets, nostrils and the entire oral pouch) is inside the disk.
        seed_cut = (P[:, 1] < eyes_mid[1] + ed * 0.45) & (P[:, 2] > eyes_mid[2] - ed * 2.2) & (r < 0.9)
        adj = [[] for _ in range(len(body))]
        for u, v in e:
            adj[u].append(v); adj[v].append(u)
        outside = np.zeros(len(body), dtype=bool)
        foot = int(np.argmin(P[:, 2]))
        stack = [foot]; outside[foot] = True
        while stack:
            x = stack.pop()
            for y in adj[x]:
                if not outside[y] and not seed_cut[y]:
                    outside[y] = True
                    stack.append(y)
        is_inner = ~outside
        inner = np.where(is_inner)[0]
        outer = np.where(outside & head_front & (r >= 0.9) & (r < 1.25))[0]
        pos = -np.ones(len(body), dtype=np.int64)
        pos[inner] = np.arange(len(inner))
        n_in = len(inner)
        L = np.zeros((n_in, n_in))
        fixed_pairs = []  # (inner row, fixed body-local vertex)
        for u, v in e:
            for x, y in ((u, v), (v, u)):
                if is_inner[x]:
                    L[pos[x], pos[x]] += 1.0
                    if is_inner[y]:
                        L[pos[x], pos[y]] -= 1.0
                    else:
                        fixed_pairs.append((pos[x], y))
        fc.zone_state = {"inner": inner, "outer": outer, "L_inv": np.linalg.inv(L), "fixed": np.array(fixed_pairs, dtype=np.int64)}
        print("[build] faceless: relaxing", n_in, "face vertices onto the sculpted surface")
    zs = fc.zone_state
    inner, outer = zs["inner"], zs["outer"]

    def surface_y(xz):
        y = f(xz / ed) * ed
        # subtle sculpted nose ridge (vertical gaussian on the centre line)
        t = (xz[:, 1] - (eyes_mid[2] - ed * 0.75)) / (ed * 0.75)
        ridge = np.exp(-((xz[:, 0] - cx) / (ed * 0.16)) ** 2) * smoothstep(0.15, 0.55, t) * smoothstep(1.15, 0.75, t)
        return y - ridge * ed * 0.05

    # Tutte embedding in the (x, z) face plane: every inner vertex (incl. eye sockets, nostrils and
    # mouth bag) becomes the average of its neighbours with the ring fixed -> fold-free layout
    # that is then projected onto the smooth surface.
    b = np.zeros((len(inner), 2))
    np.add.at(b, zs["fixed"][:, 0], P[zs["fixed"][:, 1]][:, [0, 2]])
    xz = zs["L_inv"] @ b
    P_new = P.copy()
    P_new[inner, 0] = xz[:, 0]
    P_new[inner, 2] = xz[:, 1]
    P_new[inner, 1] = surface_y(xz)
    # feather band: keep x/z, ease y onto the surface
    blend = smoothstep(1.25, 0.9, r[outer])
    y_fit_o = surface_y(P[outer][:, [0, 2]])
    P_new[outer, 1] = P[outer, 1] * (1 - blend) + np.minimum(P[outer, 1], y_fit_o) * blend
    out[body] = P_new
    if interior_body is None:
        interior_body = np.zeros(len(body), dtype=bool)
    return out, interior_body


# ----------------------------------------------------------------------------------------------
# Garment fitting (exact MakeHuman MHCLO formula, vectorised)
# ----------------------------------------------------------------------------------------------
class GarmentFit:
    def __init__(self, mhclo, scale_factor):
        n = len(mhclo.verts)
        self.v = np.zeros((n, 3), dtype=np.int64)
        self.w = np.zeros((n, 3))
        self.o = np.zeros((n, 3))
        for i in range(n):
            info = mhclo.verts[i]
            self.v[i] = info["verts"]
            self.w[i] = info["weights"]
            self.o[i] = info["offsets"]
        self.xs, self.ys, self.zs = mhclo.x_scale, mhclo.y_scale, mhclo.z_scale
        self.scale_factor = scale_factor

    def fit(self, H):
        if self.xs:
            x_size = abs(H[self.xs[0], 0] - H[self.xs[1], 0]) / self.xs[2]
            y_size = abs(H[self.ys[0], 2] - H[self.ys[1], 2]) / self.ys[2]
            z_size = abs(H[self.zs[0], 1] - H[self.zs[1], 1]) / self.zs[2]
        else:
            x_size = y_size = z_size = self.scale_factor
        P = (self.w[:, 0:1] * H[self.v[:, 0]] + self.w[:, 1:2] * H[self.v[:, 1]] + self.w[:, 2:3] * H[self.v[:, 2]])
        P += self.o * np.array([x_size, z_size, y_size])
        return P


# ----------------------------------------------------------------------------------------------
# Mesh construction helpers
# ----------------------------------------------------------------------------------------------
def set_coords(obj, coords):
    obj.data.vertices.foreach_set("co", coords.astype(np.float32).ravel())
    obj.data.update()


def add_shape_keys(obj, base_coords, states):
    set_coords(obj, base_coords)
    obj.shape_key_add(name="Basis", from_mix=False)
    for name, coords in states.items():
        sk = obj.shape_key_add(name=name, from_mix=False)
        sk.data.foreach_set("co", coords.astype(np.float32).ravel())
        sk.value = 0.0


def build_body_object(basemesh, body_idx):
    """Body-only copy of the base mesh (helpers removed). Holes left by removed interior
    face geometry (eye sockets, nostrils, mouth bag) are closed with new faces that reuse
    the existing rim vertices, so shape keys stay valid."""
    me = basemesh.data.copy()
    obj = bpy.data.objects.new("MannequinBody", me)
    bpy.context.scene.collection.objects.link(obj)
    if me.shape_keys:
        obj.shape_key_clear()
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    keep = np.zeros(len(me.vertices), dtype=bool)
    keep[body_idx] = True
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context="VERTS")
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        res = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
        new_faces = res.get("faces", [])
        tri = bmesh.ops.triangulate(bm, faces=new_faces, quad_method="BEAUTY", ngon_method="BEAUTY")
        new_faces = tri.get("faces", new_faces)
        uv = bm.loops.layers.uv.active
        if uv is not None:
            new_set = set(new_faces)
            for f in new_faces:
                for loop in f.loops:
                    for other in loop.vert.link_loops:
                        if other.face not in new_set:
                            loop[uv].uv = other[uv].uv
                            break
        print("[build] filled", len(boundary), "boundary edges with", len(new_faces), "faces")
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def keep_loose_parts(obj, rule):
    """Optionally keep only some loose parts of a combined MakeHuman outfit mesh."""
    if not rule:
        return None
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen = np.zeros(len(bm.verts), dtype=bool)
    parts = []
    for v in bm.verts:
        if seen[v.index]:
            continue
        stack = [v]
        comp = []
        while stack:
            x = stack.pop()
            if seen[x.index]:
                continue
            seen[x.index] = True
            comp.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if not seen[o.index]:
                    stack.append(o)
        parts.append(np.array(comp))
    co = np.array([v.co[:] for v in bm.verts])
    keep = np.zeros(len(bm.verts), dtype=bool)
    for comp in parts:
        c = co[comp]
        info = {"zmin": c[:, 2].min(), "zmax": c[:, 2].max(), "zmean": c[:, 2].mean(), "n": len(comp),
                "xspan": np.ptp(c[:, 0])}
        if rule(info):
            keep[comp] = True
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    return np.where(keep)[0]


def mesh_vertex_normals(obj, coords):
    me = obj.data
    tris = []
    for poly in me.polygons:
        vs = list(poly.vertices)
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    if not tris:
        return np.zeros_like(coords)
    t = np.array(tris, dtype=np.int64)
    fn = np.cross(coords[t[:, 1]] - coords[t[:, 0]], coords[t[:, 2]] - coords[t[:, 0]])
    vn = np.zeros_like(coords)
    for k in range(3):
        np.add.at(vn, t[:, k], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)


def compute_covered_body_verts(body_base, obj, g_base, slot):
    me = obj.data
    from collections import Counter
    edge_face_count = Counter()
    for poly in me.polygons:
        for ek in poly.edge_keys:
            edge_face_count[ek] += 1
    bnd_verts = sorted({v for ek, c in edge_face_count.items() if c == 1 for v in ek})
    zmin, zmax = g_base[:, 2].min(), g_base[:, 2].max()
    cand = (body_base[:, 2] >= zmin - 0.01) & (body_base[:, 2] <= zmax + 0.01)
    if slot == "gloves":
        cand &= np.abs(body_base[:, 0]) > 0.25
    elif slot == "shoes":
        cand &= body_base[:, 2] < 0.16
    elif slot in ("top", "bottom", "dress"):
        # never hide head, hands or feet from torso/leg garments
        cand &= (body_base[:, 2] > 0.12) & (body_base[:, 2] < 1.38) & (np.abs(body_base[:, 0]) < 0.36)
    idx = np.where(cand)[0]
    if len(idx) == 0:
        return []
    B = body_base[idx]
    d_g = np.min(np.linalg.norm(B[:, None, :] - g_base[None, :, :], axis=2), axis=1)
    if bnd_verts:
        G_b = g_base[bnd_verts]
        d_b = np.min(np.linalg.norm(B[:, None, :] - G_b[None, :, :], axis=2), axis=1)
    else:
        d_b = np.full(len(idx), 1.0)
    covered = (d_g < 0.034) & (d_b > 0.026)
    return [int(i) for i in idx[covered]]


JOINT_MAP = {
    "pelvis": "joint-pelvis",
    "spine1": "joint-spine-1",
    "spine2": "joint-spine-2",
    "spine3": "joint-spine-3",
    "neck": "joint-neck",
    "head": "joint-head",
    "clavicleL": "joint-l-clavicle",
    "clavicleR": "joint-r-clavicle",
    "shoulderL": "joint-l-shoulder",
    "shoulderR": "joint-r-shoulder",
    "elbowL": "joint-l-elbow",
    "elbowR": "joint-r-elbow",
    "handL": "joint-l-hand",
    "handR": "joint-r-hand",
    "handTipL": "joint-l-hand-2",
    "handTipR": "joint-r-hand-2",
    "hipL": "joint-l-upper-leg",
    "hipR": "joint-r-upper-leg",
    "kneeL": "joint-l-knee",
    "kneeR": "joint-r-knee",
    "ankleL": "joint-l-ankle",
    "ankleR": "joint-r-ankle",
    "footL": "joint-l-foot-1",
    "footR": "joint-r-foot-1",
}


def extract_threejs_joints(basemesh, coords):
    joints = {}
    for key, vg_name in JOINT_MAP.items():
        if vg_name in basemesh.vertex_groups:
            idx = group_vertices(basemesh, vg_name)
            if len(idx) > 0:
                p = coords[idx].mean(axis=0)
                # Blender (x, y, z) with export_yup=True -> Three.js (x, z, -y)
                joints[key] = [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]
    return joints


def export_glb(obj, path, use_morph=True):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=False, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials="PLACEHOLDER",
        export_vertex_color="ACTIVE",
        export_morph=bool(use_morph),
        export_morph_normal=False, export_morph_tangent=False, export_yup=True,
        export_skins=False, export_animations=False, export_extras=False,
    )


def region_effect(base, state, mask_rel=0.35):
    """Mean relative radial growth (around the local vertical axis) of the affected region."""
    d = np.linalg.norm(state - base, axis=1)
    if d.max() < 1e-6:
        return 0.0
    m = d > d.max() * mask_rel
    c = base[m].mean(axis=0)
    r0 = np.linalg.norm((base[m] - c)[:, :2], axis=1)
    r1 = np.linalg.norm((state[m] - c)[:, :2], axis=1)
    return float(np.mean(r1 / np.maximum(r0, 1e-6)) - 1.0)


# ----------------------------------------------------------------------------------------------
def main():
    t0 = time.time()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)

    basemesh = HumanService.create_human(feet_on_ground=False)
    scale_factor = 0.1
    body_idx = group_vertices(basemesh, "body")
    fc = FaceContext(basemesh, body_idx)
    print("[build] basemesh verts", len(basemesh.data.vertices), "body verts", len(body_idx))

    # --- evaluate all states (full basemesh coords incl. helpers, faceless applied)
    raw_cache = {}
    base_H, interior_body = make_faceless(evaluate_state(basemesh, {}, {}), fc)
    raw_cache[json.dumps([{}, {}], sort_keys=True)] = base_H
    print("[build] faceless: removing", int(interior_body.sum()), "interior face vertices")

    def state_coords(macro, targets):
        key = json.dumps([macro, targets], sort_keys=True)
        if key not in raw_cache:
            raw_cache[key] = make_faceless(evaluate_state(basemesh, macro, targets), fc, interior_body)[0]
        return raw_cache[key]

    # feet on ground: shift so the lowest body vertex sits at z=0
    ground = base_H[body_idx, 2].min()  # (full body set incl. interior is fine here)
    morph_H = {}
    for name, macro, targets, ref in MORPHS:
        st = state_coords(macro, targets)
        rf = state_coords(ref, {}) if ref else base_H
        morph_H[name] = base_H + (st - rf)
    shift = np.array([0, 0, -ground])
    base_H = base_H + shift
    for k in morph_H:
        morph_H[k] = morph_H[k] + shift
    print("[build] states evaluated in %.1fs" % (time.time() - t0))

    manifest_path = os.path.join(ARGS.out, "manifest.json")
    prev_garments = {}
    if ARGS.only and os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r") as fp_prev:
                prev_garments = json.load(fp_prev).get("garments", {})
        except Exception:
            prev_garments = {}

    manifest = {
        "version": 2,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "units": "meters",
        "upAxis": "Y",
        "license": "CC0 (MakeHuman base mesh, targets and community clothes)",
        "body": {"file": "body.glb"},
        "joints": extract_threejs_joints(basemesh, base_H),
        "morphs": [m[0] for m in MORPHS],
        "morphEffects": {},
        "garments": dict(prev_garments),
    }

    # --- body
    body_idx = body_idx[~interior_body]
    body = build_body_object(basemesh, body_idx)
    body_base = base_H[body_idx]
    add_shape_keys(body, body_base, {k: v[body_idx] for k, v in morph_H.items()})
    mat = bpy.data.materials.new("skin")
    body.data.materials.clear()
    body.data.materials.append(mat)
    for k, v in morph_H.items():
        manifest["morphEffects"][k] = round(region_effect(body_base, v[body_idx]), 4)
    z = body_base[:, 2]
    manifest["body"]["height"] = float(z.max() - z.min())
    manifest["body"]["vertexCount"] = int(len(body_idx))
    if not ARGS.only:
        export_glb(body, os.path.join(ARGS.out, "body.glb"), use_morph=True)
        print("[build] body exported, height %.3f m" % manifest["body"]["height"])

    # --- garments
    only = set(filter(None, ARGS.only.split(",")))
    if not ARGS.no_garments:
        for gid, spec in GARMENTS.items():
            if only and gid not in only:
                continue
            no_morphs = bool(spec.get("no_morphs", False))
            if "procedural" in spec:
                obj, fit = build_procedural(spec["procedural"], base_H, body_idx, fc, basemesh)
                obj.name = "garment_" + gid
                g_base = fit.fit(base_H)
                g_states = {} if no_morphs else {k: fit.fit(v) for k, v in morph_H.items()}
            else:
                path = os.path.join(ARGS.assets, "clothes", spec["src"])
                if not os.path.exists(path):
                    print("[build] MISSING", gid, path)
                    continue
                mh = Mhclo()
                mh.load(path)
                obj = mh.load_mesh(bpy.context)
                obj.name = "garment_" + gid
                obj.matrix_world.identity()
                obj.data.materials.clear()
                obj.data.materials.append(bpy.data.materials.new("garment_" + gid))
                for poly in obj.data.polygons:
                    poly.use_smooth = True
                fit = GarmentFit(mh, scale_factor)
                g_base = fit.fit(base_H)
                g_states = {} if no_morphs else {k: fit.fit(v) for k, v in morph_H.items()}
                set_coords(obj, g_base)
                kept = keep_loose_parts(obj, spec.get("keep_parts"))
                if kept is not None:
                    g_base = g_base[kept]
                    g_states = {k: v[kept] for k, v in g_states.items()}
            if spec.get("post") == "extend_coat":
                g_base = extend_coat(g_base)
                g_states = {k: extend_coat(v) for k, v in g_states.items()}
            offset = float(spec.get("offset", 0.0))
            if abs(offset) > 1e-6:
                vn = mesh_vertex_normals(obj, g_base)
                g_base = g_base + vn * offset
                g_states = {k: v + vn * offset for k, v in g_states.items()}
            if no_morphs:
                set_coords(obj, g_base)
            else:
                add_shape_keys(obj, g_base, g_states)
            out_rel = "garments/%s.glb" % gid
            export_glb(obj, os.path.join(ARGS.out, out_rel), use_morph=not no_morphs)
            cull_body = bool(spec.get("cull_body", True))
            manifest["garments"][gid] = {
                "slot": spec["slot"],
                "subcategories": spec.get("subs", []),
                "genders": spec.get("genders", ["female", "male", "unspecified"]),
                "file": out_rel,
                "label": spec.get("label", gid),
                "fabric": spec.get("fabric", "cotton"),
                "cullBody": cull_body,
                "mount": spec.get("mount", "body"),
                "physics": spec.get("physics", "rigid_fitted"),
                "noMorphs": no_morphs,
                "source": spec.get("src", "procedural:" + spec.get("procedural", "")),
                "vertexCount": len(obj.data.vertices),
            }
            print("[build] garment %-20s %5d verts, cullBody=%s, mount=%s, physics=%s" % (
                gid, len(obj.data.vertices), cull_body, spec.get("mount", "body"), spec.get("physics", "rigid_fitted")
            ))

    with open(manifest_path, "w") as fp:
        json.dump(manifest, fp, indent=1)
    if ARGS.blend:
        bpy.ops.wm.save_as_mainfile(filepath=ARGS.blend)
    print("[build] done in %.1fs" % (time.time() - t0))


main()
