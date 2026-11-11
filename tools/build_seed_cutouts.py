#!/usr/bin/env python3
"""
Studio Packshot Transparent WebP Cutout Builder (`public/seed/*.webp`).

Generates clean, alpha-matted, edge-decontaminated WebP cutouts for all 42 studio seed
garments so Dark Mode (`#000000` / `#1C1C1E`) and runtime color re-tinting exhibit zero
paper halos, zero cast-shadow tinting, and open interior bag/belt loops.
"""

import argparse
import os
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SEED_DIR = os.path.join(REPO_ROOT, 'public', 'seed')

PAIRED_ITEMS = {
    'white-sneakers.jpg',
    'black-loafers.jpg',
    'studio-boots.jpg',
    'studio-heels.jpg',
    'studio-gloves.jpg',
    'studio-leather-gloves.jpg',
    'studio-socks.jpg',
    'studio-crew-socks.jpg',
}

# Only items with true enclosed background loops unreachable from image perimeter
ITEMS_WITH_INTERIOR_HOLES = {
    'studio-tote.jpg',
    'studio-bag.jpg',
    'studio-briefcase.jpg',
    'studio-belt.jpg',
    'black-blazer.jpg',
    'charcoal-slacks.jpg',
}

# Warm beige/oatmeal garments whose fabric hue sits close to darkened studio paper
WARM_BEIGE_FABRIC_ITEMS = {
    'beige-trench.jpg',
    'cream-knit.jpg',
    'studio-chinos.jpg',
    'studio-jogger.jpg',
    'studio-dress.jpg',
    'studio-onepiece.jpg',
    'studio-skirt.jpg',
    'studio-gloves.jpg',
    'studio-heels.jpg',
    'studio-muffler.jpg',
    'studio-padding.jpg',
    'studio-tote.jpg',
    'studio-bag.jpg',
}

# Ultra-low-contrast cool/neutral white cotton & silk garments on cream studio paper
WHITE_COTTON_ITEMS = {
    'white-shirt.jpg',
    'studio-inner-top.jpg',
    'studio-tshirt.jpg',
    'studio-blouse.jpg',
}


def fit_background_plane(rgb: np.ndarray, border: int = 8) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = rgb.shape
    mask = np.zeros((h, w), dtype=bool)
    mask[:border, :] = True
    mask[-border:, :] = True
    mask[:, :border] = True
    mask[:, -border:] = True

    ys, xs = np.where(mask)
    xn = xs / max(1.0, w - 1.0)
    yn = ys / max(1.0, h - 1.0)
    A = np.stack([np.ones_like(xn), xn, yn, xn * xn, xn * yn, yn * yn], axis=1)
    samples = rgb[ys, xs].astype(np.float64)

    coeffs, _, _, _ = np.linalg.lstsq(A, samples, rcond=None)
    pred = A @ coeffs
    err = np.linalg.norm(samples - pred, axis=1)
    keep = err <= np.percentile(err, 88) + 1.8
    if np.sum(keep) >= 24:
        coeffs, _, _, _ = np.linalg.lstsq(A[keep], samples[keep], rcond=None)

    gy, gx = np.mgrid[0:h, 0:w]
    gxn = (gx / max(1.0, w - 1.0)).ravel()
    gyn = (gy / max(1.0, h - 1.0)).ravel()
    G = np.stack([np.ones_like(gxn), gxn, gyn, gxn * gxn, gxn * gyn, gyn * gyn], axis=1)
    plane = (G @ coeffs).reshape(h, w, 3)
    return np.clip(plane, 2.0, 254.5).astype(np.float32), mask


def compute_gradient_and_texture(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    f = rgb.astype(np.float32)
    p = np.pad(f, ((1, 1), (1, 1), (0, 0)), mode='edge')
    gx = (
        (p[:-2, 2:] + 2.0 * p[1:-1, 2:] + p[2:, 2:])
        - (p[:-2, :-2] + 2.0 * p[1:-1, :-2] + p[2:, :-2])
    ) / 8.0
    gy = (
        (p[2:, :-2] + 2.0 * p[2:, 1:-1] + p[2:, 2:])
        - (p[:-2, :-2] + 2.0 * p[:-2, 1:-1] + p[:-2, 2:])
    ) / 8.0
    grad_mag = np.sqrt(np.sum(gx * gx + gy * gy, axis=2))

    lum = 0.299 * f[:, :, 0] + 0.587 * f[:, :, 1] + 0.114 * f[:, :, 2]
    blur_small = np.asarray(
        Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(radius=1.2)
        ),
        dtype=np.float32,
    )
    hp = np.abs(lum - blur_small)
    tex_energy = (
        np.asarray(
            Image.fromarray(np.clip(hp * 12.0, 0, 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(radius=2.0)
            ),
            dtype=np.float32,
        )
        / 12.0
    )
    return grad_mag, tex_energy


def compute_optical_shadow_metrics(
    rgb: np.ndarray, bg_plane: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    d_paper = np.linalg.norm(rgb - bg_plane, axis=2)

    d_img = -np.log(np.clip(rgb, 1.0, 254.5) / 255.0)
    d_bg = -np.log(np.clip(bg_plane, 1.0, 254.5) / 255.0)
    denom = np.sum(d_bg * d_bg, axis=2) + 1e-6
    p_power = np.sum(d_img * d_bg, axis=2) / denom
    p_clamped = np.clip(p_power, 0.80, 8.2)

    pred_shadow = 255.0 * np.power(bg_plane / 255.0, p_clamped[:, :, None])
    d_shadow = np.linalg.norm(rgb - pred_shadow, axis=2)
    return d_paper, d_shadow, p_power


def flood_fill_from_border(passable: np.ndarray) -> np.ndarray:
    h, w = passable.shape
    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    for x in range(w):
        if passable[0, x] and not visited[0, x]:
            visited[0, x] = True
            q.append((0, x))
        if passable[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(1, h - 1):
        if passable[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            q.append((y, 0))
        if passable[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        cy, cx = q.popleft()
        if cy > 0 and passable[cy - 1, cx] and not visited[cy - 1, cx]:
            visited[cy - 1, cx] = True
            q.append((cy - 1, cx))
        if cy < h - 1 and passable[cy + 1, cx] and not visited[cy + 1, cx]:
            visited[cy + 1, cx] = True
            q.append((cy + 1, cx))
        if cx > 0 and passable[cy, cx - 1] and not visited[cy, cx - 1]:
            visited[cy, cx - 1] = True
            q.append((cy, cx - 1))
        if cx < w - 1 and passable[cy, cx + 1] and not visited[cy, cx + 1]:
            visited[cy, cx + 1] = True
            q.append((cy, cx + 1))

    return visited


def keep_top_foreground_components(
    fg: np.ndarray, max_components: int = 1, min_ratio: float = 0.18
) -> np.ndarray:
    h, w = fg.shape
    visited = np.zeros((h, w), dtype=bool)
    comps = []

    for y in range(h):
        for x in range(w):
            if not fg[y, x] or visited[y, x]:
                continue
            q = deque([(y, x)])
            visited[y, x] = True
            pixels = []
            while q:
                cy, cx = q.popleft()
                pixels.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
            comps.append(pixels)

    if not comps:
        return fg

    comps.sort(key=len, reverse=True)
    largest = len(comps[0])
    out = np.zeros((h, w), dtype=bool)
    for idx, pix in enumerate(comps[:max_components]):
        if idx == 0 or len(pix) >= largest * min_ratio:
            ys, xs = zip(*pix)
            out[ys, xs] = True
    return out


def morph_close_open(mask: np.ndarray, close_sz: int = 5, open_sz: int = 3) -> np.ndarray:
    im = Image.fromarray(mask.astype(np.uint8) * 255)
    if close_sz >= 3:
        im = im.filter(ImageFilter.MaxFilter(close_sz)).filter(ImageFilter.MinFilter(close_sz))
    if open_sz >= 3:
        im = im.filter(ImageFilter.MinFilter(open_sz)).filter(ImageFilter.MaxFilter(open_sz))
    return np.asarray(im) > 127


def carve_true_interior_holes(
    solid_fg: np.ndarray,
    rgb: np.ndarray,
    d_paper: np.ndarray,
    d_shadow: np.ndarray,
    p_power: np.ndarray,
    grad_mag: np.ndarray,
    tex_energy: np.ndarray,
    fname: str,
) -> np.ndarray:
    if fname not in ITEMS_WITH_INTERIOR_HOLES:
        return solid_fg

    h, w = solid_fg.shape
    xw = rgb[:, :, 0] - rgb[:, :, 2]
    if fname in ('studio-tote.jpg', 'studio-bag.jpg'):
        # Pure bright/lightly-shadowed studio paper between leather straps (never dark taupe leather!)
        row_y = np.arange(h)[:, None]
        in_handle_zone = row_y < int(h * 0.46)
        hole_cand = (
            solid_fg
            & in_handle_zone
            & (
                (d_paper < 20.0)
                | ((p_power >= 0.78) & (p_power <= 1.75) & (d_shadow < 11.5))
            )
        )
        min_hole_px = 8
    elif fname in ('black-blazer.jpg', 'charcoal-slacks.jpg'):
        # Bright/mid or warm-tan enclosed paper slits between sleeve & torso or upper trouser legs (neutral wool has xw <= 4)
        hole_cand = solid_fg & (
            (d_paper < 95.0)
            | ((p_power >= 0.78) & (p_power <= 6.2) & (d_shadow < 28.0))
            | (xw >= 12.0)
        )
        min_hole_px = 4
    else:
        # Belt center / buckle loops & briefcase handle arch
        hole_cand = solid_fg & (
            (d_paper < 20.0)
            | ((p_power >= 0.80) & (p_power <= 5.5) & (d_shadow < 14.5))
        )
        hole_cand = morph_close_open(hole_cand, close_sz=3, open_sz=3)
        min_hole_px = 24

    if not np.any(hole_cand):
        return solid_fg

    visited = np.zeros((h, w), dtype=bool)
    out_fg = solid_fg.copy()

    for y in range(h):
        for x in range(w):
            if not hole_cand[y, x] or visited[y, x]:
                continue
            q = deque([(y, x)])
            visited[y, x] = True
            pix = []
            while q:
                cy, cx = q.popleft()
                pix.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and hole_cand[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))

            if len(pix) < min_hole_px:
                continue

            ys, xs = zip(*pix)
            med_paper = float(np.median(d_paper[ys, xs]))
            med_shadow = float(np.median(d_shadow[ys, xs]))
            med_tex = float(np.median(tex_energy[ys, xs]))
            med_p = float(np.median(p_power[ys, xs]))
            med_xw = float(np.median(xw[ys, xs]))

            if fname in ('studio-tote.jpg', 'studio-bag.jpg'):
                if med_paper < 22.0 or (med_shadow < 11.5 and 0.78 <= med_p <= 1.75):
                    out_fg[ys, xs] = False
            elif fname in ('black-blazer.jpg', 'charcoal-slacks.jpg'):
                if med_paper < 98.0 or (med_shadow < 28.0 and 0.78 <= med_p <= 6.2) or med_xw >= 12.0:
                    out_fg[ys, xs] = False
            elif (med_paper < 24.0 or (med_shadow < 13.5 and 0.80 <= med_p <= 4.5)) and med_tex < 2.6:
                out_fg[ys, xs] = False

    return out_fg


def peel_bright_contact_rim_on_dark_garments(
    fg: np.ndarray,
    rgb: np.ndarray,
    d_paper: np.ndarray,
    d_shadow: np.ndarray,
    p_power: np.ndarray,
) -> np.ndarray:
    """
    Iteratively peels bright paper/JPEG/crescent-shadow pixels clinging to the outer perimeter
    of dark garments (`black-blazer`, `charcoal-slacks`, `studio-belt`, `studio-cap`, `studio-briefcase`, etc.).
    Run BEFORE `carve_true_interior_holes` so interior silver belt buckles are never exposed to the outer rim!
    """
    if np.sum(fg) < 200:
        return fg

    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    sat = np.max(rgb, axis=2) - np.min(rgb, axis=2)

    eroded = np.asarray(
        Image.fromarray(fg.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(9))
    ) > 127
    sample_mask = eroded if np.sum(eroded) >= 100 else fg
    med_lum = float(np.median(lum[sample_mask]))

    if med_lum > 132.0:
        return fg

    bright_cut = max(med_lum + 28.0, 112.0)
    out = fg.copy()
    for _ in range(36):
        bg = ~out
        adj_bg = (
            np.asarray(
                Image.fromarray(bg.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))
            )
            > 127
        )
        rim = out & adj_bg
        is_paper_fringe = (
            rim
            & (lum > bright_cut)
            & (sat < 48.0)
            & ((d_paper < 145.0) | ((p_power <= 7.5) & (d_shadow < 42.0)))
        )
        if not np.any(is_paper_fringe):
            break
        out[is_paper_fringe] = False

    return out


def subpixel_matte_and_decontaminate(
    rgb: np.ndarray, bg_plane: np.ndarray, fg: np.ndarray
) -> Image.Image:
    h, w, _ = rgb.shape
    mask_u8 = fg.astype(np.uint8) * 255
    mask_im = Image.fromarray(mask_u8)

    core_fg = np.asarray(mask_im.filter(ImageFilter.MinFilter(9))) > 127
    if np.sum(core_fg) < 80:
        core_fg = np.asarray(mask_im.filter(ImageFilter.MinFilter(5))) > 127
    if np.sum(core_fg) < 20:
        core_fg = fg.copy()

    dilated_zone = np.asarray(mask_im.filter(ImageFilter.MaxFilter(5))) > 127

    # Propagate pure 4px-interior RGB outward across the contour band
    valid = core_fg.copy()
    fg_local = rgb.astype(np.float32).copy()
    for _ in range(10):
        need = dilated_zone & (~valid)
        if not np.any(need):
            break
        acc = np.zeros_like(fg_local)
        cnt = np.zeros((h, w, 1), dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sy0, sy1 = max(0, -dy), min(h, h - dy)
                sx0, sx1 = max(0, -dx), min(w, w - dx)
                dy0, dy1 = max(0, dy), min(h, h + dy)
                dx0, dx1 = max(0, dx), min(w, w + dx)
                v_slice = valid[sy0:sy1, sx0:sx1, None].astype(np.float32)
                acc[dy0:dy1, dx0:dx1] += fg_local[sy0:sy1, sx0:sx1] * v_slice
                cnt[dy0:dy1, dx0:dx1] += v_slice
        fillable = need & (cnt[:, :, 0] > 0)
        if not np.any(fillable):
            break
        fg_local[fillable] = acc[fillable] / cnt[fillable]
        valid[fillable] = True

    eroded_3 = np.asarray(mask_im.filter(ImageFilter.MinFilter(3)), dtype=np.float32) / 255.0
    eroded_5 = np.asarray(mask_im.filter(ImageFilter.MinFilter(5)), dtype=np.float32) / 255.0
    geom_seed = 0.38 * eroded_5 + 0.44 * eroded_3 + 0.18 * fg.astype(np.float32)
    geom_alpha = (
        np.asarray(
            Image.fromarray(np.clip(geom_seed * 255.0, 0, 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(radius=0.85)
            ),
            dtype=np.float32,
        )
        / 255.0
    )

    vec_fg_bg = fg_local - bg_plane
    dist_fg_bg_sq = np.sum(vec_fg_bg * vec_fg_bg, axis=2)
    dist_fg_bg = np.sqrt(dist_fg_bg_sq + 1e-6)
    proj_alpha = np.sum((rgb - bg_plane) * vec_fg_bg, axis=2) / (dist_fg_bg_sq + 1e-4)
    proj_alpha = np.clip(proj_alpha, 0.0, 1.0)

    rim_band = (~core_fg) & dilated_zone
    contrast_weight = np.clip((dist_fg_bg - 26.0) / 44.0, 0.0, 1.0)

    final_alpha = geom_alpha.copy()
    blended_rim = (1.0 - contrast_weight) * geom_alpha + contrast_weight * np.minimum(
        geom_alpha * 1.12, proj_alpha
    )
    final_alpha[rim_band] = blended_rim[rim_band]
    final_alpha[core_fg] = 1.0
    final_alpha[~dilated_zone] = 0.0
    final_alpha = np.clip((final_alpha - 0.12) / 0.86, 0.0, 1.0)

    out_rgb = rgb.astype(np.float32).copy()
    edge_px = (final_alpha > 0.0) & (~core_fg)
    if np.any(edge_px):
        a_safe = np.clip(final_alpha[edge_px, None], 0.38, 1.0)
        unmixed = np.clip((rgb[edge_px] - (1.0 - a_safe) * bg_plane[edge_px]) / a_safe, 0.0, 255.0)
        cw = contrast_weight[edge_px, None]
        w_prop = np.clip((1.0 - final_alpha[edge_px, None]) * 0.88 + 0.42 * cw, 0.35, 0.98)
        out_rgb[edge_px] = w_prop * fg_local[edge_px] + (1.0 - w_prop) * unmixed

    out_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    out_rgba[:, :, :3] = np.clip(np.round(out_rgb), 0, 255).astype(np.uint8)
    out_rgba[:, :, 3] = np.clip(np.round(final_alpha * 255.0), 0, 255).astype(np.uint8)
    out_rgba[out_rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(out_rgba, mode='RGBA')


def extract_garment_cutout(path: str, max_side: int = 640) -> Image.Image:
    fname = os.path.basename(path)
    im = Image.open(path).convert('RGBA')
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    rgba = np.asarray(im)
    rgb = rgba[:, :, :3].astype(np.float32)
    bg_plane, border_mask = fit_background_plane(rgb, border=8)
    if rgba.shape[2] == 4 and np.min(rgba[:, :, 3]) < 250:
        a0 = rgba[:, :, 3:4].astype(np.float32) / 255.0
        rgb = rgb * a0 + bg_plane * (1.0 - a0)

    grad_mag, tex_energy = compute_gradient_and_texture(rgb)
    d_paper, d_shadow, p_power = compute_optical_shadow_metrics(rgb, bg_plane)
    sat = np.max(rgb, axis=2) - np.min(rgb, axis=2)

    bg_dp_p99 = float(np.percentile(d_paper[border_mask], 99))
    bg_grad_p99 = float(np.percentile(grad_mag[border_mask], 99))

    if fname == 'studio-scarf.jpg':
        # Folded square silk scarf: strip paper & outer drop shadow, then restore all cream silk geometric triangles inside the square fold
        passable = (d_paper < max(9.5, bg_dp_p99 + 2.5)) | (
            (p_power >= 1.15) & (p_power <= 6.2) & (d_shadow < 13.5) & (grad_mag < 11.0)
        )
        raw_fg = morph_close_open(~flood_fill_from_border(passable), close_sz=19, open_sz=5)
        raw_fg = keep_top_foreground_components(raw_fg, max_components=1)
        ys, xs = np.where(raw_fg)
        if len(xs) > 100:
            x_left = int(np.percentile(xs, 1.5))
            x_right = int(np.percentile(xs, 98.5))
            y_top = int(np.percentile(ys, 1.5))
            y_bot = int(np.percentile(ys, 98.5))
            # Restore cream geometric silk triangles across the full square fold interior
            raw_fg[y_top + 4 : y_bot - 6, x_left + 4 : x_right - 5] = True
            raw_fg = morph_close_open(raw_fg, close_sz=11, open_sz=5)
        return subpixel_matte_and_decontaminate(rgb, bg_plane, raw_fg)

    if fname == 'studio-glasses.jpg':
        passable = (d_paper < 15.0) | ((p_power >= 0.80) & (p_power <= 6.2) & (d_shadow < 16.5))
        ext_bg = flood_fill_from_border(passable)
        frame_fg = keep_top_foreground_components(~ext_bg, max_components=1)
        frame_fg = peel_bright_contact_rim_on_dark_garments(frame_fg, rgb, d_paper, d_shadow, p_power)
        hull = ~flood_fill_from_border(~frame_fg)
        lenses = hull & (~frame_fg)
        out_im = subpixel_matte_and_decontaminate(rgb, bg_plane, frame_fg)
        out_arr = np.asarray(out_im).copy()
        if np.any(lenses):
            out_arr[lenses, 0] = 225
            out_arr[lenses, 1] = 230
            out_arr[lenses, 2] = 238
            out_arr[lenses, 3] = 28
        return Image.fromarray(out_arr, mode='RGBA')

    if fname == 'studio-cardigan.png':
        # Warm sand cardigan (`sat >= 24`, `d_shadow >= 10`) on neutral off-white studio backdrop + neutral gray soft shadow (`sat <= 12`, `d_shadow < 6`)
        is_pure_paper = d_paper <= 9.0
        is_neutral_drop_shadow = (sat <= 14.0) & (d_shadow < 8.5) & (p_power >= 0.90) & (p_power <= 4.5)
        passable = is_pure_paper | is_neutral_drop_shadow
        ext_bg = flood_fill_from_border(passable)
        fg = morph_close_open(~ext_bg, close_sz=5, open_sz=3)
    elif fname in WHITE_COTTON_ITEMS:
        paper_thresh = max(4.6, min(8.2, bg_dp_p99 + 1.35))
        seam_thresh = max(2.8, min(5.2, bg_grad_p99 + 0.9))
        paper_warmth = bg_plane[:, :, 0] - bg_plane[:, :, 2]
        px_warmth = rgb[:, :, 0] - rgb[:, :, 2]
        is_pure_paper = (d_paper <= paper_thresh) & (grad_mag < seam_thresh)
        is_cool_white_shirt = fname == 'white-shirt.jpg'
        is_cast_shadow = (
            (p_power >= (1.08 if is_cool_white_shirt else 1.32))
            & (p_power <= 7.0)
            & (d_shadow < (14.5 if is_cool_white_shirt else 13.0))
            & (px_warmth >= paper_warmth - (1.0 if is_cool_white_shirt else 1.5))
            & (grad_mag < (8.2 if is_cool_white_shirt else 7.2))
            & (tex_energy < (1.45 if is_cool_white_shirt else 1.35))
        )
        passable = is_pure_paper | is_cast_shadow
        ext_bg = flood_fill_from_border(passable)
        fg = morph_close_open(
            ~ext_bg,
            close_sz=7 if is_cool_white_shirt else 9,
            open_sz=7 if is_cool_white_shirt else 5,
        )
    elif fname in ('studio-beanie.jpg', 'white-sneakers.jpg'):
        paper_thresh = max(8.5, bg_dp_p99 + 1.5)
        is_pure_paper = (d_paper <= paper_thresh) & (grad_mag < max(5.5, bg_grad_p99 + 1.0))
        # Texture guard (`tex_energy < 2.15`) protects ribbed beanie grooves & sneaker laces/stitching!
        is_cast_shadow = (
            (p_power >= 1.22)
            & (p_power <= 7.5)
            & (d_shadow < 15.2)
            & (grad_mag < 9.2)
            & (tex_energy < 2.15)
        )
        # Smooth shadow-only zone near bottom edge (`y > 0.74 * h`) where paper grain is smooth (`tex_energy < 1.35`)
        h_px = rgb.shape[0]
        in_bottom_zone = np.arange(h_px)[:, None] > int(h_px * 0.74)
        is_bottom_smooth_shadow = (
            in_bottom_zone
            & (p_power >= 1.28)
            & (p_power <= 7.5)
            & (d_shadow < 16.8)
            & (tex_energy < 1.35)
        )
        passable = is_pure_paper | is_cast_shadow | is_bottom_smooth_shadow
        ext_bg = flood_fill_from_border(passable)
        open_k = 7 if fname == 'white-sneakers.jpg' else 5
        fg = morph_close_open(~ext_bg, close_sz=7, open_sz=open_k)
    elif fname in WARM_BEIGE_FABRIC_ITEMS:
        paper_thresh = max(8.5, bg_dp_p99 + 2.0)
        is_pure_paper = (d_paper <= paper_thresh) & (grad_mag < 6.8)
        is_bag = fname in ('studio-tote.jpg', 'studio-bag.jpg')
        shadow_d_lim = 14.2 if fname == 'studio-heels.jpg' else (13.8 if is_bag else 11.8)
        shadow_g_lim = 12.0 if fname == 'studio-heels.jpg' else (10.5 if is_bag else 6.8)
        is_cast_shadow = (
            (p_power >= 1.18)
            & (p_power <= 6.2)
            & (d_shadow < shadow_d_lim)
            & (grad_mag < shadow_g_lim)
            & (tex_energy < 1.65)
        )
        passable = is_pure_paper | is_cast_shadow
        ext_bg = flood_fill_from_border(passable)
        fg = morph_close_open(~ext_bg, close_sz=5, open_sz=3)
    else:
        # Dark, navy, charcoal, olive, brown leather & burgundy garments:
        is_pure_paper = d_paper < max(16.0, bg_dp_p99 + 3.5)
        is_cast_shadow = (p_power >= 0.80) & (p_power <= 7.2) & (d_shadow < 18.5)
        if fname == 'black-loafers.jpg':
            lum_px = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
            xw_px = rgb[:, :, 0] - rgb[:, :, 2]
            is_valley_shadow = (lum_px > 74.0) & (xw_px >= 14.0) & (grad_mag < 36.0)
            passable = is_pure_paper | is_cast_shadow | is_valley_shadow
            ext_bg = flood_fill_from_border(passable)
            fg = morph_close_open(~ext_bg, close_sz=3, open_sz=5)
        else:
            passable = is_pure_paper | is_cast_shadow
            ext_bg = flood_fill_from_border(passable)
            fg = morph_close_open(~ext_bg, close_sz=5, open_sz=3)

    max_comps = 2 if fname in PAIRED_ITEMS else 1
    fg = keep_top_foreground_components(fg, max_components=max_comps, min_ratio=0.22)

    if max_comps == 2:
        close_pair = 3 if fname == 'black-loafers.jpg' else 5
        solid_fg = morph_close_open(fg, close_sz=close_pair, open_sz=3)
        solid_fg = keep_top_foreground_components(solid_fg, max_components=2, min_ratio=0.22)
        solid_fg = ~flood_fill_from_border(~solid_fg)
    else:
        solid_fg = ~flood_fill_from_border(~fg)

    # Peel outer perimeter paper/crescent shadows BEFORE interior holes are carved (protects silver belt buckle!)
    if fname not in WHITE_COTTON_ITEMS and fname not in WARM_BEIGE_FABRIC_ITEMS and fname != 'studio-watch.jpg':
        solid_fg = peel_bright_contact_rim_on_dark_garments(solid_fg, rgb, d_paper, d_shadow, p_power)

    fg_final = carve_true_interior_holes(
        solid_fg, rgb, d_paper, d_shadow, p_power, grad_mag, tex_energy, fname
    )
    return subpixel_matte_and_decontaminate(rgb, bg_plane, fg_final)


def simulate_tint(cut_im: Image.Image, hex_color: str, preserve_dial: bool = False) -> Image.Image:
    arr = np.asarray(cut_im).astype(np.float32).copy()
    alpha = arr[:, :, 3] / 255.0
    fg = alpha > 0.08
    if not np.any(fg):
        return cut_im

    hx = hex_color.lstrip('#')
    tr, tg, tb = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
    tgt_lum = 0.299 * tr + 0.587 * tg + 0.114 * tb

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)

    mean_lum = float(np.clip(np.sum(lum[fg] * alpha[fg]) / np.sum(alpha[fg]), 42.0, 215.0))

    metal_or_dial = np.where(
        (sat < 22.0) & (lum > (185.0 if preserve_dial else 212.0)),
        np.clip((lum - (185.0 if preserve_dial else 212.0)) / 32.0, 0.0, 1.0)
        * (0.95 if preserve_dial else 0.75),
        0.0,
    )
    blend = (1.0 - metal_or_dial) * 0.88
    exp = 0.76 if tgt_lum < 45 else 0.92
    shade_ratio = np.power(np.clip(lum / mean_lum, 0.12, 2.2), exp)
    dark_sheen = np.maximum(0.0, (lum - mean_lum * 0.92) * (0.24 if tgt_lum < 42 else 0.0))
    spec_lift = np.maximum(0.0, (lum - mean_lum * 1.18) * 0.28) + dark_sheen

    nr = np.clip(tr * shade_ratio + spec_lift, 0, 255)
    ng = np.clip(tg * shade_ratio + spec_lift, 0, 255)
    nb = np.clip(tb * shade_ratio + spec_lift, 0, 255)

    arr[fg, 0] = r[fg] * (1.0 - blend[fg]) + nr[fg] * blend[fg]
    arr[fg, 1] = g[fg] * (1.0 - blend[fg]) + ng[fg] * blend[fg]
    arr[fg, 2] = b[fg] * (1.0 - blend[fg]) + nb[fg] * blend[fg]
    return Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), mode='RGBA')


def main():
    parser = argparse.ArgumentParser(description='Build transparent studio seed WebP cutouts.')
    parser.add_argument('--preview-dir', default='', help='Optional directory to write Dark Mode contact sheets.')
    parser.add_argument('--write-webp', action='store_true', help='Write transparent .webp files to public/seed/.')
    parser.add_argument('--only', default='', help='Optional comma-separated filenames to regenerate.')
    args = parser.parse_args()

    files = sorted(
        f
        for f in os.listdir(SEED_DIR)
        if f.endswith(('.jpg', '.png')) and not f.startswith('store-')
    )
    only_set = {x.strip() for x in args.only.split(',') if x.strip()} if args.only else set()

    cut_cache: dict[str, Image.Image] = {}
    written = 0
    for fname in files:
        stem = os.path.splitext(fname)[0]
        dst_path = os.path.join(SEED_DIR, f'{stem}.webp')
        if only_set and fname not in only_set and os.path.exists(dst_path):
            if args.preview_dir:
                cut_cache[fname] = Image.open(dst_path).convert('RGBA')
            continue
        src_path = os.path.join(SEED_DIR, fname)
        cut = extract_garment_cutout(src_path, max_side=640)
        cut_cache[fname] = cut
        if args.write_webp:
            cut.save(dst_path, format='WEBP', quality=92, method=6)
            written += 1

    if args.write_webp:
        print(f'Wrote {written} transparent WebP cutouts to {SEED_DIR}')

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        cols = 7
        rows = (len(files) + cols - 1) // cols
        tw, th = 220, 270
        sheet = Image.new('RGBA', (cols * tw + 16, rows * th + 16), (0, 0, 0, 255))
        draw = ImageDraw.Draw(sheet)

        for idx, fname in enumerate(files):
            c, r = idx % cols, idx // cols
            x0 = 8 + c * tw + 6
            y0 = 8 + r * th + 6
            draw.rounded_rectangle(
                [x0, y0, x0 + tw - 12, y0 + th - 32],
                radius=16,
                fill=(28, 28, 30, 255),
            )
            thumb = cut_cache[fname].copy()
            thumb.thumbnail((tw - 32, th - 56), Image.Resampling.LANCZOS)
            ox = x0 + ((tw - 12) - thumb.width) // 2
            oy = y0 + ((th - 32) - thumb.height) // 2
            sheet.alpha_composite(thumb, (ox, oy))
            draw.text((x0 + 4, y0 + th - 28), fname, fill=(210, 210, 216, 255))

        out_path = os.path.join(args.preview_dir, 'all_seeds_dark_cutout_v4.png')
        sheet.convert('RGB').save(out_path)
        print(f'Rendered {len(files)} cutouts onto Dark Mode sheet: {out_path}')

        stress_cases = [
            ('studio-tote.jpg', '#7B8465', 'Olive Tote'),
            ('white-sneakers.jpg', '#E0B94F', 'Yellow Sneakers'),
            ('studio-crew-socks.jpg', '#B65831', 'Rust Socks'),
            ('studio-inner-top.jpg', '#EBE8E1', 'Ivory Tank'),
            ('studio-leather-gloves.jpg', '#8C4422', 'Cognac Gloves'),
            ('charcoal-slacks.jpg', '#5D4030', 'Brown Slacks'),
            ('cream-knit.jpg', '#7A8666', 'Sage Turtleneck'),
            ('beige-trench.jpg', '#DDD6CA', 'Ivory Coat'),
            ('studio-scarf.jpg', '#7B8465', 'Olive Scarf'),
            ('studio-beanie.jpg', '#EAE5DB', 'Cream Beanie'),
            ('studio-watch.jpg', '#4A3528', 'Leather Watch'),
            ('studio-boots.jpg', '#8C4422', 'Cognac Boots'),
            ('studio-cardigan.png', '#A64B2A', 'Terracotta Cardi'),
            ('black-blazer.jpg', '#1A1A1C', 'Jet Black Blazer'),
        ]
        scols, srows = 7, 2
        ssheet = Image.new('RGBA', (scols * tw + 16, srows * th + 16), (0, 0, 0, 255))
        sdraw = ImageDraw.Draw(ssheet)
        for idx, (fn, hx, title) in enumerate(stress_cases):
            c, r = idx % scols, idx // scols
            x0 = 8 + c * tw + 6
            y0 = 8 + r * th + 6
            sdraw.rounded_rectangle(
                [x0, y0, x0 + tw - 12, y0 + th - 32],
                radius=16,
                fill=(28, 28, 30, 255),
            )
            tinted = simulate_tint(cut_cache[fn], hx, preserve_dial=(fn == 'studio-watch.jpg'))
            tinted.thumbnail((tw - 32, th - 56), Image.Resampling.LANCZOS)
            ox = x0 + ((tw - 12) - tinted.width) // 2
            oy = y0 + ((th - 32) - tinted.height) // 2
            ssheet.alpha_composite(tinted, (ox, oy))
            sdraw.text((x0 + 4, y0 + th - 28), f'{title} ({hx})', fill=(210, 210, 216, 255))

        stress_path = os.path.join(args.preview_dir, 'tinted_stress_dark_v4.png')
        ssheet.convert('RGB').save(stress_path)
        print(f'Rendered 14 tinted stress cases: {stress_path}')


if __name__ == '__main__':
    main()
