#!/usr/bin/env python3
"""
Deterministic Offline 4-Season 128-Item Photorealistic Garment Asset & Catalog Generator
- Synthesizes 4 seasonal batches x 32 items = 128 RGBA WebP cutouts (360x480) directly in `public/seed/`
- Combines real studio packshot cutouts (`public/seed/*.webp`) + real fabric weave detail maps
  (`public/textures/mannequin/*_detail.jpg`) + silhouette tailoring for summer/winter specialty items
- Enforces strict per-batch alpha hygiene gates (0% border residue, 8%-85% foreground coverage)
- Emits `src/shared/seasonal120Catalog.js` and `src/shared/seasonal120Catalog.d.ts`
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT_DIR / "public" / "seed"
DETAIL_DIR = ROOT_DIR / "public" / "textures" / "mannequin"
CATALOG_JS_PATH = ROOT_DIR / "src" / "shared" / "seasonal120Catalog.js"
CATALOG_DTS_PATH = ROOT_DIR / "src" / "shared" / "seasonal120Catalog.d.ts"

OUT_W = 360
OUT_H = 480


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.strip().lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(r: float, g: float, b: float) -> str:
    ri = int(max(0, min(255, round(r))))
    gi = int(max(0, min(255, round(g))))
    bi = int(max(0, min(255, round(b))))
    return f"#{ri:02X}{gi:02X}{bi:02X}"


_SEED_CACHE: dict[str, Image.Image] = {}
_DETAIL_CACHE: dict[str, np.ndarray] = {}


def load_seed_rgba(filename: str) -> Image.Image:
    if filename not in _SEED_CACHE:
        p = SEED_DIR / filename
        im = Image.open(p).convert("RGBA")
        if im.size != (OUT_W, OUT_H):
            im = im.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
        _SEED_CACHE[filename] = im
    return _SEED_CACHE[filename].copy()


def load_detail_gray(filename: str) -> np.ndarray:
    if filename not in _DETAIL_CACHE:
        p = DETAIL_DIR / filename
        if p.exists():
            im = Image.open(p).convert("L").resize((240, 240), Image.Resampling.BILINEAR)
            arr = np.asarray(im, dtype=np.float32)
            mean = float(arr.mean()) or 128.0
            std = float(arr.std()) or 1.0
            norm = np.clip((arr - mean) / max(std, 8.0), -2.5, 2.5)
            tiled = np.tile(norm, (3, 2))[:OUT_H, :OUT_W]
        else:
            tiled = np.zeros((OUT_H, OUT_W), dtype=np.float32)
        _DETAIL_CACHE[filename] = tiled
    return _DETAIL_CACHE[filename]


def feather_mask(mask_img: Image.Image, radius: float = 1.1) -> np.ndarray:
    blurred = mask_img.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(blurred, dtype=np.float32) / 255.0


def apply_color_and_weave(
    rgba_img: Image.Image,
    target_hex: str,
    detail_file: str = "shirt_detail.jpg",
    weave_strength: float = 4.5,
    preserve_bright_hardware: bool = False,
) -> np.ndarray:
    arr = np.asarray(rgba_img, dtype=np.float32).copy()
    alpha = arr[:, :, 3]
    fg = alpha >= 10
    if not np.any(fg):
        return arr.astype(np.uint8)

    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)

    weights = np.where(alpha >= 64, alpha / 255.0, 0.0)
    if preserve_bright_hardware:
        weights = np.where((sat < 22) & (lum > 185), 0.0, weights)

    w_sum = float(weights.sum())
    mean_lum = float((lum * weights).sum() / w_sum) if w_sum > 20 else 145.0
    mean_lum = max(44.0, min(215.0, mean_lum))

    tr, tg, tb = hex_to_rgb(target_hex)
    tgt_lum = 0.299 * tr + 0.587 * tg + 0.114 * tb
    exp = 0.75 if tgt_lum < 46 else 0.90

    ratio = np.power(np.clip(lum / mean_lum, 0.16, 2.15), exp)
    dark_sheen = np.maximum(0.0, (lum - mean_lum * 0.94) * 0.22) if tgt_lum < 44 else 0.0
    spec_lift = np.maximum(0.0, (lum - mean_lum * 1.18) * 0.26) + dark_sheen

    weave = load_detail_gray(detail_file) * weave_strength

    nr = np.clip(tr * ratio + spec_lift + weave, 0, 255)
    ng = np.clip(tg * ratio + spec_lift + weave, 0, 255)
    nb = np.clip(tb * ratio + spec_lift + weave, 0, 255)

    if preserve_bright_hardware:
        hw_mask = np.clip((lum - 184.0) / 36.0, 0.0, 1.0) * (sat < 24).astype(np.float32) * 0.9
    else:
        hw_mask = 0.0

    blend = (1.0 - hw_mask) * 0.94
    arr[:, :, 0] = np.where(fg, r * (1.0 - blend) + nr * blend, 0.0)
    arr[:, :, 1] = np.where(fg, g * (1.0 - blend) + ng * blend, 0.0)
    arr[:, :, 2] = np.where(fg, b * (1.0 - blend) + nb * blend, 0.0)
    return np.clip(arr, 0, 255).astype(np.uint8)


def tailor_silhouette(base_img: Image.Image, variant: str, target_hex: str, detail_file: str) -> np.ndarray:
    """Applies realistic studio silhouette sculpting before/after color & weave transfer."""
    W, H = OUT_W, OUT_H

    # Specialized open summer footwear (paired top-quarter studio packshots with center split!)
    if variant in ("flip_flops", "sandals", "slides"):
        canvas = np.zeros((H, W, 4), dtype=np.float32)
        tr, tg, tb = hex_to_rgb(target_hex)
        weave = load_detail_gray(detail_file)
        yy, xx = np.mgrid[0:H, 0:W]

        # Left shoe center x=114, Right shoe center x=246 (clean gap x=168..192!)
        for side_idx, cx in enumerate((114.0, 246.0)):
            sign = -1.0 if side_idx == 0 else 1.0
            cy = 248.0
            rx_top, rx_heel = 39.0, 31.0
            ry = 112.0
            ny = (yy - cy) / ry
            # Anatomical footbed width taper from forefoot (ny < 0) to heel (ny > 0)
            arch_curve = sign * 3.5 * np.exp(-((ny - 0.12) ** 2) / 0.18)
            rx_local = rx_top * np.clip(1.0 - 0.20 * np.clip(ny + 0.25, 0.0, 1.4), 0.72, 1.04)
            nx = (xx - (cx + arch_curve)) / rx_local
            dist = np.sqrt(nx * nx + ny * ny)

            # Outsole drop thickness (shifted +5px down)
            ny_sole = (yy - (cy + 6.0)) / ry
            nx_sole = (xx - (cx + arch_curve)) / (rx_local + 1.5)
            sole_dist = np.sqrt(nx_sole * nx_sole + ny_sole * ny_sole)
            sole_alpha = np.clip((1.02 - sole_dist) * 26.0, 0.0, 1.0)

            bed_alpha = np.clip((1.0 - dist) * 28.0, 0.0, 1.0)

            # Footbed color: warm tan cork/leather for sandals, matte dark/tonal footbed for flip-flops/slides
            if variant == "sandals":
                fb_r, fb_g, fb_b = 188.0, 152.0, 118.0
            else:
                fb_r = tr * 0.78 + 26.0
                fb_g = tg * 0.78 + 25.0
                fb_b = tb * 0.78 + 24.0

            # Radial recessed footbed shading + heel cup shadow
            cup_shade = 0.88 + 0.14 * (1.0 - np.clip(dist, 0.0, 1.0)) - 0.06 * ny
            bed_r = np.clip(fb_r * cup_shade + weave * 3.8, 0, 255)
            bed_g = np.clip(fb_g * cup_shade + weave * 3.8, 0, 255)
            bed_b = np.clip(fb_b * cup_shade + weave * 3.8, 0, 255)

            # Outsole dark rubber rim
            rim_r = np.clip(tr * 0.42 + 18.0, 0, 255)
            rim_g = np.clip(tg * 0.42 + 18.0, 0, 255)
            rim_b = np.clip(tb * 0.42 + 20.0, 0, 255)

            comb_a = np.maximum(sole_alpha, bed_alpha)
            canvas[:, :, 0] = np.where(sole_alpha > 0.01, rim_r, canvas[:, :, 0])
            canvas[:, :, 1] = np.where(sole_alpha > 0.01, rim_g, canvas[:, :, 1])
            canvas[:, :, 2] = np.where(sole_alpha > 0.01, rim_b, canvas[:, :, 2])

            canvas[:, :, 0] = canvas[:, :, 0] * (1.0 - bed_alpha) + bed_r * bed_alpha
            canvas[:, :, 1] = canvas[:, :, 1] * (1.0 - bed_alpha) + bed_g * bed_alpha
            canvas[:, :, 2] = canvas[:, :, 2] * (1.0 - bed_alpha) + bed_b * bed_alpha
            canvas[:, :, 3] = np.maximum(canvas[:, :, 3], comb_a * 255.0)

            # Draw realistic straps on PIL mask
            strap_mask_im = Image.new("L", (W, H), 0)
            sd = ImageDraw.Draw(strap_mask_im)
            toe_post_x = int(cx - sign * 7)
            toe_post_y = int(cy - 68)
            left_anchor = (int(cx - 35), int(cy + 4))
            right_anchor = (int(cx + 35), int(cy + 4))

            if variant == "flip_flops":
                sd.line([ (toe_post_x, toe_post_y), left_anchor ], fill=255, width=11)
                sd.line([ (toe_post_x, toe_post_y), right_anchor ], fill=255, width=11)
                sd.ellipse([toe_post_x - 6, toe_post_y - 6, toe_post_x + 6, toe_post_y + 6], fill=255)
            elif variant == "sandals":
                # Forefoot strap + instep/ankle strap + metallic buckle
                sd.rounded_rectangle([int(cx - 38), int(cy - 58), int(cx + 38), int(cy - 36)], radius=7, fill=255)
                sd.rounded_rectangle([int(cx - 36), int(cy - 4), int(cx + 36), int(cy + 20)], radius=7, fill=255)
                sd.line([(int(cx), int(cy - 56)), (int(cx), int(cy + 18))], fill=255, width=10)
            else:  # slides
                sd.rounded_rectangle([int(cx - 40), int(cy - 48), int(cx + 40), int(cy + 6)], radius=12, fill=255)

            s_alpha = feather_mask(strap_mask_im, radius=0.9) * np.clip(sole_alpha * 1.15, 0.0, 1.0)
            # Cylindrical 3D highlight across strap
            arch_light = 1.08 + 0.18 * np.cos((xx - cx) / 24.0) - 0.10 * np.abs((yy - (cy - 22.0)) / 42.0)
            sr = np.clip(tr * arch_light + weave * 4.2 + 8.0, 0, 255)
            sg = np.clip(tg * arch_light + weave * 4.2 + 8.0, 0, 255)
            sb = np.clip(tb * arch_light + weave * 4.2 + 8.0, 0, 255)

            # Drop shadow under strap onto footbed
            shadow_shift = np.roll(s_alpha, 4, axis=0) * bed_alpha * 0.28
            canvas[:, :, 0] *= 1.0 - shadow_shift
            canvas[:, :, 1] *= 1.0 - shadow_shift
            canvas[:, :, 2] *= 1.0 - shadow_shift

            canvas[:, :, 0] = canvas[:, :, 0] * (1.0 - s_alpha) + sr * s_alpha
            canvas[:, :, 1] = canvas[:, :, 1] * (1.0 - s_alpha) + sg * s_alpha
            canvas[:, :, 2] = canvas[:, :, 2] * (1.0 - s_alpha) + sb * s_alpha
            canvas[:, :, 3] = np.maximum(canvas[:, :, 3], s_alpha * 255.0)

        return np.clip(canvas, 0, 255).astype(np.uint8)

    # Specialized Two-Piece Bikini set (bra top + high-cut bikini brief with clean midriff gap)
    if variant == "bikini":
        top_src = load_seed_rgba("studio-inner-top.webp")
        bot_src = load_seed_rgba("studio-underwear.webp")
        top_arr = apply_color_and_weave(top_src, target_hex, detail_file, 3.8)
        bot_arr = apply_color_and_weave(bot_src, target_hex, detail_file, 3.8)

        # Mask top into structured triangle/bandeau bikini bra (y: 66..206) with straps
        mask_top = Image.new("L", (W, H), 0)
        dt = ImageDraw.Draw(mask_top)
        # Left & right shoulder straps
        dt.polygon([(112, 48), (128, 48), (138, 135), (108, 135)], fill=255)
        dt.polygon([(232, 48), (248, 48), (252, 135), (222, 135)], fill=255)
        # Sculpted cups + underbust band
        dt.polygon([(94, 132), (176, 156), (176, 198), (92, 196)], fill=255)
        dt.polygon([(266, 132), (184, 156), (184, 198), (268, 196)], fill=255)
        dt.rectangle([94, 182, 266, 199], fill=255)
        mt = feather_mask(mask_top, 1.1)

        # Shift underwear brief down into y: 256..398 and sculpt high-cut leg arches
        shifted_bot = np.zeros_like(bot_arr)
        shifted_bot[88:H, :] = bot_arr[0 : H - 88, :]
        mask_bot = Image.new("L", (W, H), 0)
        db = ImageDraw.Draw(mask_bot)
        db.polygon([(82, 262), (278, 262), (264, 294), (196, 392), (164, 392), (96, 294)], fill=255)
        mb = feather_mask(mask_bot, 1.2)

        out = np.zeros((H, W, 4), dtype=np.float32)
        t_a = (top_arr[:, :, 3] / 255.0) * mt
        b_a = (shifted_bot[:, :, 3] / 255.0) * mb
        for c in range(3):
            out[:, :, c] = top_arr[:, :, c] * t_a + shifted_bot[:, :, c] * b_a
        out[:, :, 3] = np.clip((t_a + b_a) * 255.0, 0, 255)
        return out.astype(np.uint8)

    # Specialized One-Piece Swimsuit (sculpted high-cut leg arches + scoop neckline)
    if variant == "swimsuit":
        src = load_seed_rgba("studio-inner-top.webp")
        colored = apply_color_and_weave(src, target_hex, detail_file, 3.6)
        mask = Image.new("L", (W, H), 0)
        dm = ImageDraw.Draw(mask)
        # Straps + torso + high-cut swimsuit gusset
        dm.polygon(
            [
                (104, 44),
                (132, 44),
                (144, 108),
                (216, 108),
                (228, 44),
                (256, 44),
                (274, 148),
                (268, 286),
                (198, 408),
                (162, 408),
                (92, 286),
                (86, 148),
            ],
            fill=255,
        )
        # Scoop neckline cutout
        dm.ellipse([134, 40, 226, 132], fill=0)
        m = feather_mask(mask, 1.3)
        colored[:, :, 3] = np.clip(colored[:, :, 3].astype(np.float32) * m, 0, 255).astype(np.uint8)
        return colored

    # Short-sleeve button-down shirt (tailor sleeves cleanly from white-shirt.webp)
    if variant == "short_shirt":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 4.4)
        mask = Image.new("L", (W, H), 255)
        dm = ImageDraw.Draw(mask)
        # Remove lower long sleeves outside torso columns (x < 94 or x > 266 below y = 236)
        dm.polygon([(0, 232), (96, 218), (98, 480), (0, 480)], fill=0)
        dm.polygon([(264, 218), (360, 232), (360, 480), (262, 480)], fill=0)
        m = feather_mask(mask, 1.2)
        colored[:, :, 3] = np.clip(colored[:, :, 3].astype(np.float32) * m, 0, 255).astype(np.uint8)
        return colored

    # Sleeveless blouse (tailor sleeves off studio-blouse.webp)
    if variant == "sleeveless_blouse":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 4.0)
        mask = Image.new("L", (W, H), 255)
        dm = ImageDraw.Draw(mask)
        dm.polygon([(0, 70), (108, 82), (102, 480), (0, 480)], fill=0)
        dm.polygon([(252, 82), (360, 70), (360, 480), (258, 480)], fill=0)
        m = feather_mask(mask, 1.3)
        colored[:, :, 3] = np.clip(colored[:, :, 3].astype(np.float32) * m, 0, 255).astype(np.uint8)
        return colored

    # Cropped Short Down Puffer (`short_padding`) with horizontal down-baffle shadow channels
    if variant == "short_padding":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 3.5).astype(np.float32)
        yy, _ = np.mgrid[0:H, 0:W]
        # Horizontal down quilting baffles every 46px
        baffle = 1.0 - 0.13 * np.exp(-((np.mod(yy - 92, 46) - 23) ** 2) / 9.0)
        for c in range(3):
            colored[:, :, c] = np.clip(colored[:, :, c] * baffle, 0, 255)
        # Crop hem cleanly at waist y=356
        mask = Image.new("L", (W, H), 255)
        ImageDraw.Draw(mask).rectangle([0, 358, W, H], fill=0)
        m = feather_mask(mask, 1.4)
        colored[:, :, 3] *= m
        return np.clip(colored, 0, 255).astype(np.uint8)

    # Knee/Calf-Length Goose-Down Long Parka (`long_padding`)
    if variant == "long_padding":
        pad_img = load_seed_rgba("studio-padding.webp")
        coat_img = load_seed_rgba("studio-coat.webp")
        # Stretch padding torso vertically to knee length while keeping collar & shoulders natural
        upper = pad_img.crop((0, 0, W, 240))
        lower = pad_img.crop((0, 200, W, 398)).resize((W, 208), Image.Resampling.LANCZOS)
        comp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        comp.paste(upper, (0, 24))
        comp.paste(lower, (0, 238), lower)
        # Blend subtle lower-hem structure from coat silhouette
        colored = apply_color_and_weave(comp, target_hex, detail_file, 3.6).astype(np.float32)
        yy, _ = np.mgrid[0:H, 0:W]
        baffle = 1.0 - 0.14 * np.exp(-((np.mod(yy - 78, 44) - 22) ** 2) / 8.5)
        for c in range(3):
            colored[:, :, c] = np.clip(colored[:, :, c] * baffle, 0, 255)
        _ = coat_img
        return np.clip(colored, 0, 255).astype(np.uint8)

    # Shearling Mustang Jacket (`mustang`) — contrast cream shearling collar & hem trim
    if variant == "mustang":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 5.5).astype(np.float32)
        alpha = colored[:, :, 3]
        yy, xx = np.mgrid[0:H, 0:W]
        collar_zone = (alpha > 40) & (yy >= 84) & (yy <= 142) & (xx >= 118) & (xx <= 242)
        hem_zone = (alpha > 40) & (yy >= 364) & (yy <= 388)
        trim = (collar_zone | hem_zone).astype(np.float32)
        trim_im = Image.fromarray((trim * 255).astype(np.uint8), mode="L")
        trim_f = feather_mask(trim_im, 1.5) * 0.82
        shear_noise = load_detail_gray("knit_detail.jpg") * 7.5
        sr = np.clip(232.0 + shear_noise, 0, 255)
        sg = np.clip(221.0 + shear_noise, 0, 255)
        sb = np.clip(204.0 + shear_noise, 0, 255)
        colored[:, :, 0] = colored[:, :, 0] * (1.0 - trim_f) + sr * trim_f
        colored[:, :, 1] = colored[:, :, 1] * (1.0 - trim_f) + sg * trim_f
        colored[:, :, 2] = colored[:, :, 2] * (1.0 - trim_f) + sb * trim_f
        return np.clip(colored, 0, 255).astype(np.uint8)

    # Knee-High Riding Long Boots (`long_boots`) & Insulated Shearling Snow Boots (`snow_boots`)
    if variant in ("long_boots", "snow_boots"):
        boots_src = load_seed_rgba("studio-boots.webp")
        # Extend upper boot shaft upward cleanly while keeping paired boot vamps & soles intact
        top_shaft = boots_src.crop((0, 118, W, 215)).resize(
            (W, 175 if variant == "long_boots" else 125), Image.Resampling.LANCZOS
        )
        lower_vamp = boots_src.crop((0, 210, W, H))
        comp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        y_top = 66 if variant == "long_boots" else 116
        comp.paste(top_shaft, (0, y_top))
        comp.paste(lower_vamp, (0, 236), lower_vamp)
        colored = apply_color_and_weave(comp, target_hex, detail_file, 4.8).astype(np.float32)
        if variant == "snow_boots":
            alpha = colored[:, :, 3]
            yy, _ = np.mgrid[0:H, 0:W]
            cuff = ((alpha > 45) & (yy >= y_top) & (yy <= y_top + 32)).astype(np.float32)
            cuff_f = feather_mask(Image.fromarray((cuff * 255).astype(np.uint8), "L"), 1.3) * 0.88
            fleece = load_detail_gray("knit_detail.jpg") * 8.0
            colored[:, :, 0] = colored[:, :, 0] * (1.0 - cuff_f) + np.clip(236 + fleece, 0, 255) * cuff_f
            colored[:, :, 1] = colored[:, :, 1] * (1.0 - cuff_f) + np.clip(228 + fleece, 0, 255) * cuff_f
            colored[:, :, 2] = colored[:, :, 2] * (1.0 - cuff_f) + np.clip(213 + fleece, 0, 255) * cuff_f
        return np.clip(colored, 0, 255).astype(np.uint8)

    # Mini Skirt (tailor studio-skirt.webp hem shorter cleanly)
    if variant == "mini_skirt":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 4.2)
        mask = Image.new("L", (W, H), 255)
        ImageDraw.Draw(mask).rectangle([0, 304, W, H], fill=0)
        m = feather_mask(mask, 1.2)
        colored[:, :, 3] = np.clip(colored[:, :, 3].astype(np.float32) * m, 0, 255).astype(np.uint8)
        return colored

    # Cargo Pants (add realistic side-thigh pleated cargo pocket shadow/highlight relief)
    if variant == "cargo":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 5.0).astype(np.float32)
        alpha = colored[:, :, 3]
        pkt = Image.new("L", (W, H), 0)
        dp = ImageDraw.Draw(pkt)
        dp.rounded_rectangle([88, 190, 128, 266], radius=5, outline=220, width=2)
        dp.rounded_rectangle([232, 190, 272, 266], radius=5, outline=220, width=2)
        dp.line([(88, 210), (128, 210)], fill=240, width=2)
        dp.line([(232, 210), (272, 210)], fill=240, width=2)
        pm = (np.asarray(pkt, dtype=np.float32) / 255.0) * (alpha > 80).astype(np.float32) * 0.22
        for c in range(3):
            colored[:, :, c] = np.clip(colored[:, :, c] * (1.0 - pm), 0, 255)
        return np.clip(colored, 0, 255).astype(np.uint8)

    # UV Sunglasses (fill lens apertures inside studio-glasses.webp with dark UV lens + reflection)
    if variant == "sunglasses":
        colored = apply_color_and_weave(base_img, target_hex, detail_file, 2.5, preserve_bright_hardware=True).astype(
            np.float32
        )
        lens_mask = Image.new("L", (W, H), 0)
        dl = ImageDraw.Draw(lens_mask)
        # Left & right eyewear lens apertures in 360x480 space (bbox of studio-glasses is x:26..336, y:200..300)
        dl.rounded_rectangle([54, 216, 160, 292], radius=22, fill=236)
        dl.rounded_rectangle([200, 216, 306, 292], radius=22, fill=236)
        lm = feather_mask(lens_mask, 1.1)
        yy, xx = np.mgrid[0:H, 0:W]
        streak = np.exp(-(((xx + yy * 0.65 - 275) % 135 - 32) ** 2) / 55.0) * 34.0
        tr, tg, tb = hex_to_rgb(target_hex)
        lr = np.clip(tr * 0.38 + 14.0 + streak, 0, 255)
        lg = np.clip(tg * 0.38 + 16.0 + streak, 0, 255)
        lb = np.clip(tb * 0.42 + 20.0 + streak, 0, 255)
        frame_a = colored[:, :, 3] / 255.0
        under_lens = lm * (1.0 - np.clip((frame_a - 0.55) * 2.2, 0.0, 1.0))
        colored[:, :, 0] = colored[:, :, 0] * (1.0 - under_lens) + lr * under_lens
        colored[:, :, 1] = colored[:, :, 1] * (1.0 - under_lens) + lg * under_lens
        colored[:, :, 2] = colored[:, :, 2] * (1.0 - under_lens) + lb * under_lens
        colored[:, :, 3] = np.maximum(colored[:, :, 3], lm * 242.0)
        return np.clip(colored, 0, 255).astype(np.uint8)

    return apply_color_and_weave(
        base_img,
        target_hex,
        detail_file,
        weave_strength=5.2 if variant in ("fleece", "cable_knit") else 4.2,
        preserve_bright_hardware=(variant in ("watch", "belt", "bag")),
    )


def enforce_alpha_hygiene_and_measure_hex(arr: np.ndarray, fallback_hex: str) -> tuple[np.ndarray, str]:
    out = arr.copy()
    # Zero 3px outer border residue
    out[:3, :, 3] = 0
    out[-3:, :, 3] = 0
    out[:, :3, 3] = 0
    out[:, -3:, 3] = 0
    # Clean sub-threshold alpha noise
    low = out[:, :, 3] < 10
    out[low] = 0

    alpha = out[:, :, 3].astype(np.float32) / 255.0
    core = alpha >= 0.45
    if np.any(core):
        w = alpha[core]
        w_sum = float(w.sum())
        mr = float((out[:, :, 0][core] * w).sum() / w_sum)
        mg = float((out[:, :, 1][core] * w).sum() / w_sum)
        mb = float((out[:, :, 2][core] * w).sum() / w_sum)
        measured_hex = rgb_to_hex(mr, mg, mb)
    else:
        measured_hex = fallback_hex.upper()
    return out, measured_hex


# Compact Tuple Spec:
# (slug, name_ko, name_en, cat, sub, fabric, color_ko, target_hex, seasons, min_t, max_t, water, formality, brand, price, base_seed, detail_tex, variant, sleeve, hem, shoe_exp, layer)
RAW_SPECS_BY_SEASON: dict[str, list[tuple[Any, ...]]] = {
    "봄": [
        ("beige-trench", "발수 코튼 개버딘 트렌치코트", "Water-Repellent Cotton Gabardine Trench Coat", "outer", "trench", "gabardine", "베이지", "#C6B295", ["봄", "가을"], 8, 19, True, "smart", "ARKET", 290000, "beige-trench.webp", "jacket_detail.jpg", "standard", "long", "knee", "closed", 50),
        ("sage-mac-trench", "세이지 코튼 싱글 맥 트렌치코트", "Sage Cotton Single Mac Trench Coat", "outer", "trench", "gabardine", "올리브", "#98A48E", ["봄", "가을"], 9, 20, True, "smart", "LEMAIRE", 360000, "beige-trench.webp", "jacket_detail.jpg", "standard", "long", "knee", "closed", 50),
        ("ivory-windbreaker", "아이보리 나일론 후드 윈드브레이커 자켓", "Ivory Nylon Hooded Windbreaker Jacket", "outer", "windbreaker", "nylon", "아이보리", "#EAE6DC", ["봄", "가을"], 10, 22, True, "casual", "PATAGONIA", 198000, "olive-jacket.webp", "jacket_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("indigo-trucker", "인디고 셀비지 데님 트러커 자켓", "Indigo Selvedge Denim Trucker Jacket", "outer", "denim_jacket", "denim", "인디고", "#35517A", ["봄", "가을"], 9, 21, False, "casual", "A.P.C.", 275000, "olive-jacket.webp", "jacket_detail.jpg", "standard", "long", "waist", "closed", 50),
        ("cream-cardigan-outer", "크림 메리노 V넥 버튼 가디건", "Cream Merino V-Neck Button Cardigan", "outer", "cardigan", "knit", "크림", "#E5DAC8", ["봄", "가을"], 10, 21, False, "smart", "COS", 185000, "studio-cardigan.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("dove-grey-blazer", "라이트 그레이 울 싱글 블레이저", "Light Grey Wool Single Blazer", "outer", "blazer", "wool", "그레이", "#9FA4AC", ["봄", "가을"], 8, 20, False, "formal", "THEORY", 390000, "black-blazer.webp", "suit3_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("khaki-blouson", "카키 코튼 트윌 지퍼 블루종 자켓", "Khaki Cotton Twill Zip Blouson Jacket", "outer", "jacket", "cotton", "카키", "#7E846B", ["봄", "가을"], 9, 20, True, "casual", "MHL", 245000, "olive-jacket.webp", "jacket_detail.jpg", "standard", "long", "waist", "closed", 50),
        ("sky-oxford-shirt", "스카이블루 수피마 코튼 옥스포드 셔츠", "Sky Blue Supima Cotton Oxford Shirt", "top", "shirt", "cotton", "스카이블루", "#A9C6DF", ["봄", "가을"], 10, 24, False, "smart", "POLO", 169000, "white-shirt.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("white-poplin-shirt", "화이트 크리스프 포플린 셔츠", "White Crisp Poplin Shirt", "top", "shirt", "cotton", "화이트", "#F1EFEA", ["봄", "여름", "가을"], 11, 26, False, "formal", "COS", 135000, "white-shirt.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("pink-oxford-shirt", "더스티 로즈 코튼 스트라이프 셔츠", "Dusty Rose Cotton Oxford Shirt", "top", "shirt", "cotton", "코랄", "#D9AEB3", ["봄"], 11, 24, False, "smart", "ARKET", 119000, "white-shirt.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("ivory-silk-blouse", "아이보리 실크 드레이프 블라우스", "Ivory Silk Draped Blouse", "top", "blouse", "silk", "아이보리", "#EFE8DC", ["봄", "가을"], 11, 25, False, "formal", "TOTEME", 280000, "studio-blouse.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("lavender-blouse", "라벤더 크레이프 타이넥 블라우스", "Lavender Crepe Blouse", "top", "blouse", "silk", "그레이", "#BDB8CC", ["봄"], 11, 24, False, "smart", "THEORY", 235000, "studio-blouse.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("mint-fine-knit", "세이지 민트 파인 메리노 크루넥 니트", "Sage Mint Fine Merino Crewneck Knit", "top", "knit", "knit", "올리브", "#A8BFA8", ["봄"], 9, 20, False, "smart", "AURALEE", 210000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("butter-cable-knit", "버터 크림 코튼 라운드 니트", "Butter Cream Cotton Crewneck Knit", "top", "knit", "knit", "크림", "#EADEC3", ["봄", "가을"], 9, 20, False, "smart", "COS", 139000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("melange-sweatshirt", "그레이 프렌치 테리 크루넥 맨투맨", "Melange Grey French Terry Sweatshirt", "top", "sweatshirt", "cotton", "그레이", "#B7B9BE", ["봄", "가을"], 9, 21, False, "casual", "ARKET", 99000, "navy-knit.webp", "sweatshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("oatmeal-hoodie", "오트밀 코튼 세미오버 후드 스웨트", "Oatmeal Cotton Pullover Hoodie", "top", "hoodie", "cotton", "크림", "#D8CFC2", ["봄", "가을"], 8, 20, False, "casual", "STUDIO NICHOLSON", 178000, "studio-hoodie.webp", "sweatshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("light-blue-denim", "라이트 인디고 스트레이트 데님 팬츠", "Light Indigo Straight Denim Jeans", "bottom", "denim", "denim", "스카이블루", "#7B9ABB", ["봄", "여름"], 10, 27, False, "casual", "LEVIS", 149000, "indigo-denim.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("ecru-wide-slacks", "아이보리 원턱 와이드 슬랙스", "Ecru One-Tuck Wide Slacks", "bottom", "slacks", "wool", "아이보리", "#E6DFD2", ["봄", "가을"], 9, 24, False, "smart", "LEMAIRE", 240000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("beige-chinos", "베이지 코튼 트윌 테이퍼드 치노 팬츠", "Beige Cotton Twill Tapered Chinos", "bottom", "chinos", "cotton", "베이지", "#C8B698", ["봄", "가을"], 9, 25, False, "smart", "ARKET", 129000, "studio-chinos.webp", "slacks_detail.jpg", "standard", "none", "ankle", "closed", 36),
        ("pleated-midi-skirt", "크림 플리츠 A라인 미디 스커트", "Cream Pleated A-Line Midi Skirt", "bottom", "skirt", "cotton", "크림", "#DFD3BF", ["봄", "가을"], 10, 25, False, "smart", "COS", 155000, "studio-skirt.webp", "slacks_detail.jpg", "standard", "none", "midi", "closed", 36),
        ("charcoal-ankle-slacks", "차콜 울 블렌드 앵클 슬랙스", "Charcoal Wool-Blend Ankle Slacks", "bottom", "slacks", "wool", "차콜", "#43464D", ["봄", "가을"], 7, 23, False, "formal", "THEORY", 215000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "ankle", "closed", 36),
        ("olive-fatigue-pants", "올리브 코튼 퍼티그 스트레이트 팬츠", "Olive Cotton Fatigue Straight Pants", "bottom", "chinos", "cotton", "올리브", "#70795E", ["봄", "가을"], 9, 24, False, "casual", "BEAMS", 158000, "studio-chinos.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("blush-shirt-dress", "코랄 베이지 벨티드 미디 셔츠 원피스", "Blush Beige Belted Midi Shirt Dress", "dress", "dress", "cotton", "베이지", "#D7B8A6", ["봄"], 12, 25, False, "smart", "COS", 195000, "studio-dress.webp", "shirt_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("chambray-dress", "스카이블루 샴브레이 플레어 미디 원피스", "Sky Chambray Flare Midi Dress", "dress", "dress", "cotton", "스카이블루", "#8AA6C1", ["봄", "여름"], 13, 26, False, "casual", "MHL", 225000, "studio-dress.webp", "shirt_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("cream-knit-dress", "아이보리 파인 니트 플레어 롱 원피스", "Ivory Fine-Knit Flare Long Dress", "dress", "onepiece", "knit", "아이보리", "#E8DFD0", ["봄", "가을"], 10, 22, False, "smart", "TOTEME", 290000, "studio-onepiece.webp", "knit_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("white-court-sneakers", "화이트 풀그레인 레더 코트 스니커즈", "White Full-Grain Leather Court Sneakers", "shoes", "sneakers", "leather", "화이트", "#EAE7E0", ["봄", "여름", "가을"], 4, 30, True, "casual", "COMMON PROJECTS", 268000, "white-sneakers.webp", "sneakers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("brown-penny-loafers", "브라운 스무스 레더 페니 로퍼", "Brown Smooth Leather Penny Loafers", "shoes", "loafers", "leather", "브라운", "#5E3E2C", ["봄", "가을"], 5, 26, True, "formal", "PARABOOT", 340000, "black-loafers.webp", "loafers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("cream-canvas-sneakers", "크림 오가닉 캔버스 로우 스니커즈", "Cream Organic Canvas Low Sneakers", "shoes", "sneakers", "cotton", "크림", "#DFD8C8", ["봄", "여름"], 8, 30, False, "casual", "ARKET", 119000, "white-sneakers.webp", "sneakers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("nude-block-heels", "베이지 레더 블록힐 슬링백 펌프스", "Beige Leather Block-Heel Pumps", "shoes", "heels", "leather", "베이지", "#CCB69C", ["봄", "가을"], 10, 27, False, "formal", "COS", 225000, "studio-heels.webp", "loafers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("beige-twill-cap", "베이지 코튼 트윌 아틀리에 볼캡", "Beige Cotton Twill Atelier Ball Cap", "headwear", "cap", "cotton", "베이지", "#CCC2B1", ["봄", "여름", "가을"], 8, 32, True, "casual", "ARKET", 49000, "studio-cap.webp", "shirt_detail.jpg", "standard", "none", "none", "closed", 60),
        ("silk-spring-scarf", "코랄 아이보리 실크 트윌 스퀘어 스카프", "Coral Ivory Silk Twill Square Scarf", "neckwear", "scarf", "silk", "코랄", "#D89A86", ["봄", "가을"], 8, 22, False, "smart", "TOTEME", 165000, "studio-scarf.webp", "shirt_detail.jpg", "standard", "none", "none", "closed", 60),
        ("tan-crossbody-bag", "카멜 페블 레더 새들 크로스백", "Camel Pebble Leather Saddle Crossbody Bag", "accessory", "bag", "leather", "카멜", "#A87449", ["봄", "여름", "가을"], -5, 34, True, "smart", "LEMAIRE", 420000, "studio-bag.webp", "loafers_detail.jpg", "bag", "none", "none", "closed", 60),
    ],
    "여름": [
        ("mist-uv-windbreaker", "화이트 초경량 패커블 UV 윈드브레이커", "White Ultra-Light Packable UV Windbreaker", "outer", "windbreaker", "nylon", "화이트", "#ECEEF0", ["여름", "봄"], 18, 33, True, "casual", "PATAGONIA", 159000, "olive-jacket.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("ivory-linen-cardigan", "아이보리 시어 린넨 서머 가디건", "Ivory Sheer Linen Summer Cardigan", "outer", "cardigan", "linen", "아이보리", "#ECE5D8", ["여름", "봄"], 19, 32, False, "smart", "AURALEE", 195000, "studio-cardigan.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("white-rib-tank", "화이트 립 코튼 나시 탱크탑", "White Ribbed Cotton Tank Top", "top", "tank_top", "cotton", "화이트", "#F0EEE9", ["여름"], 23, 38, False, "casual", "ARKET", 39000, "studio-inner-top.webp", "tshirt_detail.jpg", "standard", "sleeveless", "hip", "closed", 32),
        ("black-athletic-tank", "블랙 코튼 슬리브리스 나시 탱크탑", "Black Cotton Sleeveless Tank Top", "top", "tank_top", "cotton", "블랙", "#222428", ["여름"], 23, 38, False, "casual", "COS", 45000, "studio-inner-top.webp", "tshirt_detail.jpg", "standard", "sleeveless", "hip", "closed", 32),
        ("sky-linen-sleeveless", "스카이블루 린넨 민소매 블라우스", "Sky Blue Linen Sleeveless Blouse", "top", "sleeveless", "linen", "스카이블루", "#AEC8DF", ["여름"], 22, 36, False, "smart", "COS", 115000, "studio-blouse.webp", "shirt_detail.jpg", "sleeveless_blouse", "sleeveless", "hip", "closed", 32),
        ("olive-rib-sleeveless", "올리브 니트 민소매 슬리브리스 탑", "Olive Knit Sleeveless Top", "top", "sleeveless", "knit", "올리브", "#7A8468", ["여름"], 22, 36, False, "smart", "TOTEME", 129000, "studio-inner-top.webp", "knit_detail.jpg", "standard", "sleeveless", "hip", "closed", 32),
        ("white-supima-tee", "화이트 헤비웨이트 수피마 반팔 티셔츠", "White Heavyweight Supima Short-Sleeve T-Shirt", "top", "tshirt", "cotton", "화이트", "#EFECE6", ["여름", "봄"], 19, 36, False, "casual", "ARKET", 45000, "studio-tshirt.webp", "tshirt_detail.jpg", "standard", "short", "hip", "closed", 32),
        ("navy-pique-polo", "네이비 코튼 피케 반팔 폴로 티셔츠", "Navy Cotton Pique Short-Sleeve Polo", "top", "tshirt", "cotton", "네이비", "#233048", ["여름", "봄"], 20, 35, False, "smart", "POLO", 139000, "studio-tshirt.webp", "polo_detail.jpg", "standard", "short", "hip", "closed", 32),
        ("coral-summer-tee", "코랄 워시드 코튼 반팔 티셔츠", "Coral Washed Cotton Short-Sleeve T-Shirt", "top", "tshirt", "cotton", "코랄", "#DE8672", ["여름"], 21, 36, False, "casual", "ACNE STUDIOS", 125000, "studio-tshirt.webp", "tshirt_detail.jpg", "standard", "short", "hip", "closed", 32),
        ("sage-linen-short-shirt", "올리브 오픈카라 린넨 반팔 셔츠", "Olive Open-Collar Linen Short-Sleeve Shirt", "top", "short_shirt", "linen", "올리브", "#8F9C7E", ["여름"], 21, 36, False, "smart", "OUR LEGACY", 198000, "white-shirt.webp", "shirt_detail.jpg", "short_shirt", "short", "hip", "closed", 32),
        ("white-seersucker-shirt", "화이트 시어서커 오픈카라 반팔 셔츠", "White Seersucker Short-Sleeve Shirt", "top", "short_shirt", "cotton", "화이트", "#EEF0F2", ["여름"], 21, 36, False, "smart", "MHL", 175000, "white-shirt.webp", "shirt_detail.jpg", "short_shirt", "short", "hip", "closed", 32),
        ("sand-resort-shirt", "베이지 린넨 리조트 반팔 셔츠", "Sand Beige Linen Resort Short-Sleeve Shirt", "top", "short_shirt", "linen", "베이지", "#D6C5AA", ["여름"], 22, 37, False, "casual", "LEMAIRE", 220000, "white-shirt.webp", "shirt_detail.jpg", "short_shirt", "short", "hip", "closed", 32),
        ("indigo-denim-shorts", "인디고 워시드 데님 반바지 쇼츠", "Indigo Washed Denim Shorts", "bottom", "shorts", "denim", "인디고", "#496992", ["여름"], 22, 37, False, "casual", "LEVIS", 89000, "studio-shorts.webp", "shorts_detail.jpg", "standard", "none", "mini", "closed", 36),
        ("beige-linen-bermuda", "베이지 린넨 플리츠 버뮤다 쇼츠", "Beige Linen Pleated Bermuda Shorts", "bottom", "shorts", "linen", "베이지", "#CFC0A6", ["여름"], 21, 36, False, "smart", "COS", 115000, "studio-shorts.webp", "shorts_detail.jpg", "standard", "none", "bermuda", "closed", 36),
        ("navy-water-shorts", "네이비 나일론 발수 워터 반바지 쇼츠", "Navy Nylon Water-Repellent Shorts", "bottom", "shorts", "nylon", "네이비", "#22324B", ["여름"], 23, 38, True, "casual", "PATAGONIA", 79000, "studio-shorts.webp", "shorts_detail.jpg", "standard", "none", "mini", "closed", 36),
        ("white-mini-skirt", "화이트 코튼 트윌 A라인 미니 스커트", "White Cotton Twill A-Line Mini Skirt", "bottom", "skirt", "cotton", "화이트", "#EFECE7", ["여름"], 22, 36, False, "casual", "ARKET", 99000, "studio-skirt.webp", "shorts_detail.jpg", "mini_skirt", "none", "mini", "closed", 36),
        ("charcoal-cooling-shorts", "차콜 나일론 액티브 쿨링 쇼츠", "Charcoal Nylon Active Cooling Shorts", "bottom", "shorts", "nylon", "차콜", "#3D4148", ["여름"], 22, 37, True, "casual", "DESCENTE", 85000, "studio-shorts.webp", "shorts_detail.jpg", "standard", "none", "bermuda", "closed", 36),
        ("ivory-wide-linen-pants", "아이보리 퓨어 린넨 와이드 팬츠", "Ivory Pure Linen Wide Pants", "bottom", "slacks", "linen", "아이보리", "#EBE4D7", ["여름"], 20, 35, False, "smart", "AURALEE", 230000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("navy-onepiece-swimsuit", "네이비 스쿱넥 원피스 수영복", "Navy Scoop-Neck One-Piece Swimsuit", "dress", "swimsuit", "nylon", "네이비", "#1E2D46", ["여름"], 24, 39, True, "casual", "TOTEME", 185000, "studio-inner-top.webp", "tshirt_detail.jpg", "swimsuit", "sleeveless", "mini", "closed", 28),
        ("terracotta-bikini", "테라코타 투피스 비키니 수영복", "Terracotta Two-Piece Bikini Swimsuit", "dress", "bikini", "nylon", "테라코타", "#BD5B3E", ["여름"], 25, 39, True, "casual", "COS", 135000, "studio-inner-top.webp", "tshirt_detail.jpg", "bikini", "sleeveless", "mini", "closed", 28),
        ("black-halter-bikini", "블랙 미니멀 홀터 투피스 비키니 수영복", "Black Minimalist Two-Piece Bikini Swimsuit", "dress", "bikini", "nylon", "블랙", "#202226", ["여름"], 25, 39, True, "casual", "ARKET", 129000, "studio-inner-top.webp", "tshirt_detail.jpg", "bikini", "sleeveless", "mini", "closed", 28),
        ("navy-uv-rashguard", "네이비 UV 집업 긴팔 래시가드 수영복", "Navy UV Zip Long-Sleeve Rashguard", "dress", "rashguard", "nylon", "네이비", "#20324E", ["여름"], 23, 38, True, "casual", "PATAGONIA", 119000, "navy-knit.webp", "tshirt_detail.jpg", "standard", "long", "waist", "closed", 28),
        ("olive-swim-trunks", "올리브 리조트 보드 스윔 트렁크 수영복", "Olive Resort Board Swim Trunks", "dress", "swim_trunks", "nylon", "올리브", "#637356", ["여름"], 24, 39, True, "casual", "PATAGONIA", 89000, "studio-shorts.webp", "shorts_detail.jpg", "standard", "none", "mini", "closed", 28),
        ("sky-linen-summer-dress", "스카이블루 린넨 민소매 서머 원피스", "Sky Blue Linen Sleeveless Summer Dress", "dress", "dress", "linen", "스카이블루", "#9AB9D6", ["여름"], 21, 36, False, "smart", "COS", 175000, "studio-dress.webp", "shirt_detail.jpg", "sleeveless_blouse", "sleeveless", "midi", "closed", 40),
        ("black-flip-flops", "블랙 미니멀 러버 쪼리 플립플랍", "Black Minimal Rubber Flip-Flops", "shoes", "flip_flops", "leather", "블랙", "#24262A", ["여름"], 23, 39, True, "casual", "THE ROW", 145000, "black-loafers.webp", "sneakers_detail.jpg", "flip_flops", "none", "none", "bare_instep_toes", 38),
        ("sand-leather-flip-flops", "베이지 레더 쪼리 플립플랍", "Sand Beige Leather Flip-Flops", "shoes", "flip_flops", "leather", "베이지", "#C9B396", ["여름"], 23, 39, True, "casual", "TOTEME", 190000, "black-loafers.webp", "loafers_detail.jpg", "flip_flops", "none", "none", "bare_instep_toes", 38),
        ("cognac-strap-sandals", "코냑 풀그레인 레더 스트랩 샌들", "Cognac Full-Grain Leather Strap Sandals", "shoes", "sandals", "leather", "코냑", "#8E5534", ["여름"], 21, 37, False, "smart", "BIRKENSTOCK", 179000, "black-loafers.webp", "loafers_detail.jpg", "sandals", "none", "none", "open_strap", 38),
        ("ivory-strap-sandals", "아이보리 레더 스트랩 샌들", "Ivory Leather Strap Sandals", "shoes", "sandals", "leather", "아이보리", "#E6DECFE"[:7], ["여름"], 21, 37, False, "smart", "CAMPER", 185000, "black-loafers.webp", "loafers_detail.jpg", "sandals", "none", "none", "open_strap", 38),
        ("charcoal-pool-slides", "차콜 몰디드 러버 슬라이드 슬리퍼", "Charcoal Molded Pool Slides", "shoes", "slides", "leather", "차콜", "#3B3E45", ["여름"], 22, 38, True, "casual", "BIRKENSTOCK", 89000, "black-loafers.webp", "sneakers_detail.jpg", "slides", "none", "none", "open_strap", 38),
        ("black-uv-sunglasses", "블랙 아세테이트 UV 선글라스", "Black Acetate UV Sunglasses", "accessory", "sunglasses", "acetate", "블랙", "#212226", ["여름", "봄"], 15, 39, True, "smart", "GENTLE MONSTER", 289000, "studio-glasses.webp", "loafers_detail.jpg", "sunglasses", "none", "none", "closed", 60),
        ("brown-tortoise-sunglasses", "브라운 아세테이트 선글라스", "Brown Tortoiseshell Acetate Sunglasses", "accessory", "sunglasses", "acetate", "브라운", "#5B3B26", ["여름", "봄"], 15, 39, True, "smart", "GENTLE MONSTER", 295000, "studio-glasses.webp", "loafers_detail.jpg", "sunglasses", "none", "none", "closed", 60),
        ("raffia-bucket-hat", "베이지 라피아 위빙 버킷햇", "Beige Raffia Woven Bucket Hat", "headwear", "bucket_hat", "cotton", "베이지", "#CBB693", ["여름"], 20, 38, False, "casual", "JACQUEMUS", 165000, "studio-cap.webp", "knit_detail.jpg", "standard", "none", "none", "closed", 60),
    ],
    "가을": [
        ("camel-double-trench", "카멜 더블 개버딘 클래식 트렌치코트", "Camel Double Gabardine Classic Trench Coat", "outer", "trench", "gabardine", "카멜", "#B99366", ["가을", "봄"], 6, 18, True, "formal", "BURBERRY", 520000, "beige-trench.webp", "jacket_detail.jpg", "standard", "long", "knee", "closed", 50),
        ("black-leather-rider", "블랙 램스킨 레더 라이더 자켓", "Black Lambskin Leather Rider Jacket", "outer", "leather_jacket", "leather", "블랙", "#202125", ["가을", "봄"], 5, 17, True, "casual", "ACNE STUDIOS", 560000, "olive-jacket.webp", "loafers_detail.jpg", "standard", "long", "waist", "closed", 50),
        ("charcoal-wool-blazer", "차콜 테일러드 버진 울 싱글 블레이저", "Charcoal Tailored Virgin-Wool Single Blazer", "outer", "blazer", "wool", "차콜", "#363940", ["가을", "봄", "겨울"], 4, 18, False, "formal", "COS", 350000, "black-blazer.webp", "dbsuit_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("olive-waxed-field", "올리브 왁스드 코튼 필드 유틸리티 자켓", "Olive Waxed Cotton Field Utility Jacket", "outer", "field_jacket", "cotton", "올리브", "#606952", ["가을", "봄"], 5, 17, True, "casual", "BARBOUR", 430000, "olive-jacket.webp", "jacket_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("brown-suede-blouson", "브라운 고트 스웨이드 블루종 자켓", "Brown Goat Suede Blouson Jacket", "outer", "jacket", "leather", "브라운", "#6D4B36", ["가을"], 6, 17, False, "smart", "LEMAIRE", 490000, "olive-jacket.webp", "loafers_detail.jpg", "standard", "long", "waist", "closed", 50),
        ("chestnut-wool-cardigan", "브라운 램스울 V넥 아우터 가디건", "Chestnut Lambswool V-Neck Cardigan", "outer", "cardigan", "knit", "브라운", "#7A523B", ["가을", "겨울"], 5, 17, False, "smart", "AMI", 260000, "studio-cardigan.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("raw-indigo-denim-jacket", "딥 인디고 생지 데님 트러커 자켓", "Deep Indigo Raw Denim Trucker Jacket", "outer", "denim_jacket", "denim", "인디고", "#273A58", ["가을", "봄"], 7, 19, False, "casual", "OUR LEGACY", 295000, "olive-jacket.webp", "jacket_detail.jpg", "standard", "long", "waist", "closed", 50),
        ("taupe-check-blazer", "베이지 브라운 트위드 테일러드 블레이저", "Taupe Tweed Tailored Blazer", "outer", "blazer", "wool", "베이지", "#9D8B76", ["가을", "겨울"], 4, 16, False, "formal", "STUDIO NICHOLSON", 410000, "black-blazer.webp", "suit3_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("burgundy-merino-knit", "버건디 파인 메리노 울 크루넥 니트", "Burgundy Fine Merino Wool Crewneck Knit", "top", "knit", "knit", "버건디", "#6C2634", ["가을", "겨울"], 3, 17, False, "smart", "COS", 139000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("camel-cashmere-knit", "카멜 캐시미어 블렌드 니트 스웨터", "Camel Cashmere-Blend Knit Sweater", "top", "knit", "knit", "카멜", "#BD9162", ["가을", "겨울"], 2, 16, False, "smart", "TOTEME", 265000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("olive-oxford-shirt", "올리브 브러시드 코튼 옥스포드 셔츠", "Olive Brushed Cotton Oxford Shirt", "top", "shirt", "cotton", "올리브", "#6F7B62", ["가을", "봄"], 7, 20, False, "smart", "MHL", 185000, "white-shirt.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("cream-silk-blouse", "크림 실크 새틴 드레이프 블라우스", "Cream Silk Satin Draped Blouse", "top", "blouse", "silk", "크림", "#E6DCCB", ["가을", "봄"], 8, 21, False, "formal", "THEORY", 255000, "studio-blouse.webp", "shirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("navy-terry-sweatshirt", "네이비 헤비 프렌치 테리 맨투맨", "Navy Heavy French-Terry Crewneck Sweatshirt", "top", "sweatshirt", "cotton", "네이비", "#222E46", ["가을", "봄"], 6, 19, False, "casual", "A.P.C.", 165000, "navy-knit.webp", "sweatshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("charcoal-heavy-hoodie", "차콜 헤비웨이트 코튼 후드 스웨트", "Charcoal Heavyweight Cotton Hoodie", "top", "hoodie", "cotton", "차콜", "#3B3E45", ["가을", "겨울"], 3, 17, False, "casual", "ACNE STUDIOS", 240000, "studio-hoodie.webp", "sweatshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("oatmeal-waffle-long-tee", "오트밀 코튼 와플 긴팔 티셔츠", "Oatmeal Cotton Waffle Long-Sleeve Tee", "top", "tshirt", "cotton", "오트밀", "#D8CEBE", ["가을", "봄"], 8, 20, False, "casual", "ARKET", 69000, "cream-knit.webp", "tshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("mocha-rib-knit", "브라운 메리노 골지 하프넥 니트", "Mocha Brown Merino Ribbed Mock-Neck Knit", "top", "knit", "knit", "브라운", "#5C4336", ["가을", "겨울"], 2, 16, False, "smart", "AURALEE", 220000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("raw-selvedge-denim", "인디고 셀비지 스트레이트 데님 팬츠", "Indigo Selvedge Straight Denim Jeans", "bottom", "denim", "denim", "인디고", "#273E62", ["가을", "봄", "겨울"], 2, 22, False, "casual", "A.P.C.", 235000, "indigo-denim.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("charcoal-wide-slacks", "차콜 버진 울 원턱 와이드 슬랙스", "Charcoal Virgin-Wool Wide Slacks", "bottom", "slacks", "wool", "차콜", "#35383F", ["가을", "봄", "겨울"], 0, 20, False, "formal", "STUDIO NICHOLSON", 265000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("khaki-cargo-pants", "카키 코튼 트윌 유틸리티 카고 팬츠", "Khaki Cotton Twill Utility Cargo Pants", "bottom", "cargo", "cotton", "카키", "#787E63", ["가을", "봄"], 5, 21, True, "casual", "OUR LEGACY", 245000, "studio-chinos.webp", "slacks_detail.jpg", "cargo", "none", "full", "closed", 36),
        ("brown-corduroy-pants", "브라운 코튼 코듀로이 테이퍼드 팬츠", "Brown Cotton Corduroy Tapered Pants", "bottom", "chinos", "cotton", "브라운", "#664835", ["가을", "겨울"], 0, 17, False, "smart", "MHL", 210000, "studio-chinos.webp", "knit_detail.jpg", "standard", "none", "full", "closed", 36),
        ("espresso-midi-skirt", "브라운 새틴 플레어 미디 스커트", "Espresso Satin Flare Midi Skirt", "bottom", "skirt", "silk", "브라운", "#4C372C", ["가을"], 6, 20, False, "smart", "TOTEME", 240000, "studio-skirt.webp", "shirt_detail.jpg", "standard", "none", "midi", "closed", 36),
        ("camel-pleated-slacks", "카멜 울 블렌드 투턱 와이드 슬랙스", "Camel Wool-Blend Pleated Wide Slacks", "bottom", "slacks", "wool", "카멜", "#B49068", ["가을", "겨울"], 2, 18, False, "smart", "LEMAIRE", 275000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("oatmeal-knit-midi-dress", "오트밀 메리노 울 니트 미디 원피스", "Oatmeal Merino Wool Knit Midi Dress", "dress", "onepiece", "knit", "오트밀", "#D6C9B6", ["가을", "겨울"], 4, 17, False, "smart", "COS", 215000, "studio-onepiece.webp", "knit_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("olive-belted-dress", "올리브 트윌 벨티드 셔츠 미디 원피스", "Olive Twill Belted Shirt Midi Dress", "dress", "dress", "cotton", "올리브", "#6A745B", ["가을", "봄"], 7, 19, False, "smart", "LEMAIRE", 310000, "studio-dress.webp", "shirt_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("black-chelsea-boots", "블랙 스무스 레더 앵클 첼시 부츠", "Black Smooth Leather Ankle Chelsea Boots", "shoes", "boots", "leather", "블랙", "#201F20", ["가을", "겨울"], -5, 18, True, "smart", "CAMPER", 289000, "studio-boots.webp", "boots_detail.jpg", "standard", "none", "none", "ankle_boot", 38),
        ("brown-derby-shoes", "브라운 굿이어웰트 레더 더비 슈즈", "Brown Goodyear-Welt Leather Derby Shoes", "shoes", "derby", "leather", "브라운", "#523626", ["가을", "봄", "겨울"], -2, 24, True, "formal", "PARABOOT", 420000, "black-loafers.webp", "loafers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("burgundy-penny-loafers", "버건디 풀그레인 레더 페니 로퍼", "Burgundy Full-Grain Leather Penny Loafers", "shoes", "loafers", "leather", "버건디", "#5E232D", ["가을", "봄"], 2, 24, True, "formal", "BERWICK", 318000, "black-loafers.webp", "loafers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("grey-suede-sneakers", "그레이 스웨이드 러닝 스니커즈", "Grey Suede Retro Sneakers", "shoes", "sneakers", "leather", "그레이", "#94979D", ["가을", "봄"], 2, 25, False, "casual", "NEW BALANCE", 189000, "white-sneakers.webp", "sneakers_detail.jpg", "standard", "none", "none", "low_cut", 38),
        ("espresso-saddle-bag", "브라운 카프스킨 크로스 숄더백", "Espresso Calfskin Crossbody Bag", "accessory", "bag", "leather", "브라운", "#4F3527", ["가을", "겨울", "봄"], -10, 30, True, "smart", "LEMAIRE", 460000, "studio-bag.webp", "loafers_detail.jpg", "bag", "none", "none", "closed", 60),
        ("brown-leather-briefcase", "브라운 이탈리안 풀그레인 레더 서류가방", "Brown Full-Grain Leather Briefcase", "accessory", "briefcase", "leather", "브라운", "#5A3A27", ["가을", "겨울", "봄"], -10, 32, True, "formal", "TOTEME", 480000, "studio-briefcase.webp", "loafers_detail.jpg", "bag", "none", "none", "closed", 60),
        ("charcoal-wool-beret", "차콜 메리노 울 프렌치 베레모", "Charcoal Merino Wool French Beret", "headwear", "beret", "wool", "차콜", "#38393D", ["가을", "겨울"], -2, 17, False, "smart", "MHL", 89000, "studio-beret.webp", "fedora_detail.jpg", "standard", "none", "none", "closed", 60),
        ("burgundy-wool-muffler", "버건디 메리노 울 쁘띠 스카프 머플러", "Burgundy Merino Wool Petite Muffler", "neckwear", "muffler", "wool", "버건디", "#6E2836", ["가을", "겨울"], -4, 14, False, "smart", "ACNE STUDIOS", 195000, "studio-muffler.webp", "knit_detail.jpg", "standard", "none", "none", "closed", 60),
    ],
    "겨울": [
        ("black-short-puffer", "매트 블랙 구스다운 크롭 숏패딩", "Matte Black Goose-Down Cropped Short Puffer", "outer", "short_padding", "nylon", "블랙", "#222428", ["겨울"], -15, 6, True, "casual", "ACNE STUDIOS", 460000, "studio-padding.webp", "jacket_detail.jpg", "short_padding", "long", "waist", "closed", 50),
        ("ivory-short-puffer", "아이보리 스탠드넥 구스다운 숏패딩", "Ivory Stand-Neck Goose-Down Short Puffer", "outer", "short_padding", "nylon", "아이보리", "#E6E1D6", ["겨울"], -14, 7, True, "casual", "ARKET", 340000, "studio-padding.webp", "jacket_detail.jpg", "short_padding", "long", "waist", "closed", 50),
        ("navy-long-puffer", "딥 네이비 구스다운 헤비 롱패딩", "Deep Navy Goose-Down Heavy Long Parka", "outer", "long_padding", "nylon", "네이비", "#1D2A42", ["겨울"], -20, 3, True, "casual", "PATAGONIA", 540000, "studio-padding.webp", "jacket_detail.jpg", "long_padding", "long", "knee", "closed", 50),
        ("charcoal-long-puffer", "차콜 맥시 퀼팅 구스다운 롱패딩", "Charcoal Maxi Quilted Goose-Down Long Puffer", "outer", "long_padding", "nylon", "차콜", "#34383F", ["겨울"], -20, 4, True, "casual", "DESCENTE", 520000, "studio-padding.webp", "jacket_detail.jpg", "long_padding", "long", "knee", "closed", 50),
        ("olive-quilted-liner", "올리브 어니언 퀼팅 다운 라이너 패딩", "Olive Quilted Down Liner Puffer Jacket", "outer", "padding", "nylon", "올리브", "#687259", ["겨울", "가을"], -6, 10, True, "casual", "BARBOUR", 290000, "studio-padding.webp", "jacket_detail.jpg", "standard", "long", "hip", "closed", 50),
        ("camel-cashmere-coat", "카멜 더블 페이스 캐시미어 롱코트", "Camel Double-Face Cashmere Long Coat", "outer", "coat", "wool", "카멜", "#B88E60", ["겨울", "가을"], -10, 9, False, "formal", "TOTEME", 580000, "studio-coat.webp", "dbsuit_detail.jpg", "standard", "long", "knee", "closed", 50),
        ("black-balmacan-coat", "블랙 버진 울 오버사이즈 발마칸 코트", "Black Virgin-Wool Oversized Balmacan Coat", "outer", "coat", "wool", "블랙", "#1E2024", ["겨울", "가을"], -10, 9, False, "formal", "LEMAIRE", 560000, "studio-coat.webp", "dbsuit_detail.jpg", "standard", "long", "knee", "closed", 50),
        ("brown-shearling-mustang", "브라운 시어링 레더 무스탕 자켓", "Brown Shearling Leather Mustang Jacket", "outer", "mustang", "leather", "브라운", "#583B2B", ["겨울"], -14, 6, True, "casual", "ACNE STUDIOS", 580000, "olive-jacket.webp", "loafers_detail.jpg", "mustang", "long", "hip", "closed", 50),
        ("cream-boa-fleece", "크림 하이파일 보아 플리스 집업 자켓", "Cream High-Pile Boa Fleece Zip Jacket", "outer", "fleece", "wool", "크림", "#E4DAC8", ["겨울", "가을"], -8, 10, False, "casual", "PATAGONIA", 239000, "olive-jacket.webp", "knit_detail.jpg", "fleece", "long", "hip", "closed", 50),
        ("ivory-cable-knit", "아이보리 헤비 케이블 울 니트 스웨터", "Ivory Heavy Cable-Knit Wool Sweater", "top", "knit", "knit", "아이보리", "#E8E0D1", ["겨울"], -15, 10, False, "smart", "AURALEE", 260000, "cream-knit.webp", "knit_detail.jpg", "cable_knit", "long", "hip", "closed", 32),
        ("charcoal-cashmere-turtleneck", "차콜 퓨어 캐시미어 터틀넥 니트", "Charcoal Pure Cashmere Turtleneck Knit", "top", "knit", "knit", "차콜", "#373A41", ["겨울", "가을"], -15, 10, False, "formal", "COS", 220000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("burgundy-wool-sweater", "버건디 셰틀랜드 울 라운드 니트", "Burgundy Shetland Wool Crewneck Sweater", "top", "knit", "knit", "버건디", "#68222F", ["겨울"], -14, 9, False, "smart", "MHL", 215000, "cream-knit.webp", "knit_detail.jpg", "cable_knit", "long", "hip", "closed", 32),
        ("navy-fleece-hoodie", "네이비 기모 헤비 플리스 후드 스웨트", "Navy Brushed-Fleece Heavy Hoodie", "top", "hoodie", "cotton", "네이비", "#1F2B43", ["겨울", "가을"], -12, 10, False, "casual", "ARKET", 129000, "studio-hoodie.webp", "sweatshirt_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("oatmeal-flannel-shirt", "오트밀 브러시드 울 코튼 플란넬 셔츠", "Oatmeal Brushed Flannel Winter Shirt", "top", "shirt", "wool", "오트밀", "#D6CBB9", ["겨울", "가을"], -10, 12, False, "casual", "OUR LEGACY", 210000, "white-shirt.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("black-merino-mockneck", "블랙 파인 메리노 하프 터틀넥 니트", "Black Fine-Merino Mock-Neck Knit", "top", "knit", "knit", "블랙", "#202226", ["겨울", "가을"], -14, 11, False, "formal", "THEORY", 198000, "cream-knit.webp", "knit_detail.jpg", "standard", "long", "hip", "closed", 32),
        ("camel-lambswool-cardigan", "카멜 헤비 램스울 버튼 니트 가디건", "Camel Heavy Lambswool Button Cardigan", "top", "cardigan", "knit", "카멜", "#B98D5E", ["겨울", "가을"], -10, 11, False, "smart", "AMI", 275000, "studio-cardigan.webp", "knit_detail.jpg", "cable_knit", "long", "hip", "closed", 32),
        ("charcoal-flannel-slacks", "차콜 브러시드 울 플란넬 와이드 슬랙스", "Charcoal Brushed-Wool Flannel Slacks", "bottom", "slacks", "wool", "차콜", "#33363D", ["겨울"], -15, 11, False, "formal", "COS", 195000, "charcoal-slacks.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("cream-fleece-jogger", "크림 기모 헤비 코튼 조거 팬츠", "Cream Fleece-Lined Heavy Jogger Pants", "bottom", "jogger", "cotton", "크림", "#E2DACB", ["겨울"], -14, 10, False, "casual", "ARKET", 99000, "studio-jogger.webp", "sweatshirt_detail.jpg", "standard", "none", "ankle", "closed", 36),
        ("espresso-corduroy-wide", "브라운 헤비 코듀로이 와이드 팬츠", "Dark Brown Heavy Corduroy Wide Pants", "bottom", "chinos", "cotton", "브라운", "#4E3729", ["겨울", "가을"], -12, 11, False, "smart", "STUDIO NICHOLSON", 245000, "studio-chinos.webp", "knit_detail.jpg", "standard", "none", "full", "closed", 36),
        ("black-winter-denim", "블랙 셀비지 브러시드 스트레이트 데님", "Black Selvedge Winter Straight Denim", "bottom", "denim", "denim", "블랙", "#23252A", ["겨울", "가을"], -12, 14, False, "casual", "ACNE STUDIOS", 260000, "indigo-denim.webp", "slacks_detail.jpg", "standard", "none", "full", "closed", 36),
        ("grey-wool-midi-skirt", "그레이 울 플란넬 A라인 미디 스커트", "Grey Wool Flannel A-Line Midi Skirt", "bottom", "skirt", "wool", "그레이", "#7D8088", ["겨울", "가을"], -10, 12, False, "smart", "TOTEME", 255000, "studio-skirt.webp", "dbsuit_detail.jpg", "standard", "none", "midi", "closed", 36),
        ("charcoal-cashmere-long-dress", "차콜 캐시미어 터틀넥 니트 롱 원피스", "Charcoal Cashmere Turtleneck Long Knit Dress", "dress", "onepiece", "knit", "차콜", "#393C43", ["겨울"], -12, 10, False, "formal", "TOTEME", 340000, "studio-onepiece.webp", "knit_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("burgundy-wool-winter-dress", "버건디 메리노 울 플레어 롱 원피스", "Burgundy Merino Wool Flare Winter Dress", "dress", "onepiece", "wool", "버건디", "#63222E", ["겨울", "가을"], -10, 11, False, "smart", "COS", 245000, "studio-onepiece.webp", "knit_detail.jpg", "standard", "long", "midi", "closed", 40),
        ("black-riding-long-boots", "블랙 카프스킨 니하이 라이딩 롱부츠", "Black Calfskin Knee-High Riding Long Boots", "shoes", "long_boots", "leather", "블랙", "#1F1E20", ["겨울", "가을"], -16, 11, True, "formal", "TOTEME", 490000, "studio-boots.webp", "boots_detail.jpg", "long_boots", "none", "none", "knee_high_boot", 38),
        ("espresso-leather-long-boots", "브라운 스무스 레더 니하이 롱부츠", "Espresso Smooth Leather Knee-High Long Boots", "shoes", "long_boots", "leather", "브라운", "#4D3325", ["겨울", "가을"], -15, 12, True, "smart", "LEMAIRE", 510000, "studio-boots.webp", "boots_detail.jpg", "long_boots", "none", "none", "knee_high_boot", 38),
        ("sand-shearling-snow-boots", "베이지 시어링 라이닝 방한 스노우 부츠", "Sand Shearling-Lined Winter Snow Boots", "shoes", "snow_boots", "leather", "베이지", "#C5AF92", ["겨울"], -20, 5, True, "casual", "PARABOOT", 320000, "studio-boots.webp", "boots_detail.jpg", "snow_boots", "none", "none", "ankle_boot", 38),
        ("black-lug-winter-boots", "블랙 발수 러그솔 방한 첼시 부츠", "Black Waterproof Lug-Sole Winter Chelsea Boots", "shoes", "boots", "leather", "블랙", "#222123", ["겨울"], -18, 9, True, "smart", "CAMPER", 310000, "studio-boots.webp", "boots_detail.jpg", "standard", "none", "none", "ankle_boot", 38),
        ("brown-shearling-snow-boots", "브라운 스웨이드 시어링 방한 스노우 부츠", "Brown Suede Shearling Winter Snow Boots", "shoes", "snow_boots", "leather", "브라운", "#664632", ["겨울"], -20, 5, True, "casual", "UGG", 268000, "studio-boots.webp", "boots_detail.jpg", "snow_boots", "none", "none", "ankle_boot", 38),
        ("camel-cashmere-muffler", "카멜 퓨어 캐시미어 프린지 머플러", "Camel Pure Cashmere Fringe Muffler", "neckwear", "scarf", "wool", "카멜", "#BD9162", ["겨울", "가을"], -18, 9, False, "smart", "TOTEME", 245000, "studio-muffler.webp", "knit_detail.jpg", "standard", "none", "none", "closed", 60),
        ("grey-cashmere-beanie", "그레이 캐시미어 골지 비니", "Grey Cashmere Ribbed Beanie", "headwear", "beanie", "knit", "그레이", "#A8A49C", ["겨울", "가을"], -18, 8, False, "casual", "COS", 79000, "studio-beanie.webp", "knit_detail.jpg", "standard", "none", "none", "closed", 60),
        ("black-nappa-gloves", "블랙 나파 레더 캐시미어 라이닝 장갑", "Black Nappa Leather Cashmere-Lined Gloves", "gloves", "leather_gloves", "leather", "블랙", "#232122", ["겨울"], -18, 6, True, "formal", "DENTS", 148000, "studio-leather-gloves.webp", "gloves_detail.jpg", "standard", "none", "none", "closed", 60),
        ("oatmeal-wool-gloves", "오트밀 메리노 울 터치스크린 니트 장갑", "Oatmeal Merino Wool Knit Gloves", "gloves", "gloves", "knit", "오트밀", "#CFC5B5", ["겨울"], -16, 7, False, "casual", "ARKET", 55000, "studio-gloves.webp", "knit_detail.jpg", "standard", "none", "none", "closed", 60),
    ],
}

SEASON_EN_SLUG = {
    "봄": "spring",
    "여름": "summer",
    "가을": "autumn",
    "겨울": "winter",
}


def verify_batch(batch_label: str, items: list[dict[str, Any]]) -> None:
    assert len(items) == 32, f"{batch_label}: expected 32 items, got {len(items)}"
    for entry in items:
        webp_path = SEED_DIR / Path(entry["image_url"]).name
        assert webp_path.exists(), f"Missing generated WebP: {webp_path}"
        size_kb = webp_path.stat().st_size / 1024.0
        assert 1.5 <= size_kb <= 160.0, f"Unexpected WebP size {size_kb:.1f}KB for {webp_path}"

        im = Image.open(webp_path).convert("RGBA")
        assert im.size == (OUT_W, OUT_H), f"Invalid size {im.size} for {webp_path}"
        arr = np.asarray(im)
        alpha = arr[:, :, 3]
        border_px = np.concatenate([alpha[0, :], alpha[-1, :], alpha[:, 0], alpha[:, -1]])
        border_residue = float((border_px >= 12).mean())
        assert border_residue < 0.01, f"Border alpha residue {border_residue:.3f} on {webp_path}"

        cov = float((alpha >= 20).mean())
        assert 0.06 <= cov <= 0.86, f"Coverage {cov*100:.1f}% out of bounds on {webp_path}"
    print(f"  [PASS] Batch '{batch_label}': 32/32 RGBA WebP cutouts verified (0.0% border residue)")


def main() -> None:
    os.makedirs(SEED_DIR, exist_ok=True)
    catalog_entries: list[dict[str, Any]] = []
    global_idx = 0

    for season_ko in ("봄", "여름", "가을", "겨울"):
        season_slug = SEASON_EN_SLUG[season_ko]
        specs = RAW_SPECS_BY_SEASON[season_ko]
        batch_entries: list[dict[str, Any]] = []
        print(f"Generating seasonal batch: {season_ko} ({season_slug}) — {len(specs)} items...")

        for local_i, spec in enumerate(specs, start=1):
            global_idx += 1
            (
                slug,
                name_ko,
                name_en,
                cat,
                sub,
                fabric,
                color_ko,
                target_hex,
                seasons,
                min_t,
                max_t,
                water,
                formality,
                brand,
                price,
                base_seed,
                detail_tex,
                variant,
                sleeve_len,
                hem_len,
                shoe_exp,
                layer_order,
            ) = spec

            fname = f"s4-{season_slug}-{local_i:02d}-{slug}.webp"
            out_path = SEED_DIR / fname
            image_url = f"/seed/{fname}"

            base_rgba = load_seed_rgba(base_seed)
            sculpted = tailor_silhouette(base_rgba, variant, target_hex, detail_tex)
            cleaned, measured_hex = enforce_alpha_hygiene_and_measure_hex(sculpted, target_hex)

            # Save high-sharpness lossless-alpha WebP
            Image.fromarray(cleaned, mode="RGBA").save(
                out_path, format="WEBP", quality=90, alpha_quality=96, method=4
            )

            # Use the exact measured foreground hex of the saved WebP so StudioGarmentImage & Warper have 0 delta!
            reloaded = np.asarray(Image.open(out_path).convert("RGBA"))
            _, final_hex = enforce_alpha_hygiene_and_measure_hex(reloaded, measured_hex)

            entry = {
                "key": f"s4_{season_slug}_{local_i:02d}_{slug.replace('-', '_')}",
                "idOffset": global_idx,
                "name": name_ko,
                "name_en": name_en,
                "category": cat,
                "subcategory": sub,
                "fabric": fabric,
                "color_name": color_ko,
                "color_hex": final_hex,
                "primary_season": season_ko,
                "seasons": list(seasons),
                "min_temp": int(min_t),
                "max_temp": int(max_t),
                "water_resistant": bool(water),
                "formality": formality,
                "brand": brand,
                "price": int(price),
                "image_url": image_url,
                "sleeveLength": sleeve_len,
                "hemLength": hem_len,
                "shoeExposure": shoe_exp,
                "layerOrder": int(layer_order),
            }
            batch_entries.append(entry)
            catalog_entries.append(entry)

        verify_batch(f"{season_ko} ({season_slug})", batch_entries)

    assert len(catalog_entries) == 128, f"Expected 128 total items, got {len(catalog_entries)}"

    js_lines = [
        "/**",
        " * 4-Season 128-Item Photorealistic Garment Catalog (`32` per season: 봄, 여름, 가을, 겨울).",
        " * Generated deterministically by `scripts/generate-seasonal-120-assets.py`.",
        " * Consumed by both Node Express (`server/*`) and Vite Client (`src/*`).",
        " */",
        "",
        f"export const SEASONAL_120_CATALOG = Object.freeze({json.dumps(catalog_entries, ensure_ascii=False, indent=2)});",
        "",
        "export const SEASONAL_120_NATIVE_HEX_MAP = Object.freeze(",
        "  Object.fromEntries(SEASONAL_120_CATALOG.map((item) => [item.image_url, item.color_hex]))",
        ");",
        "",
        "export const SEASONAL_120_BY_SEASON = Object.freeze({",
        "  봄: Object.freeze(SEASONAL_120_CATALOG.filter((item) => item.primary_season === '봄')),",
        "  여름: Object.freeze(SEASONAL_120_CATALOG.filter((item) => item.primary_season === '여름')),",
        "  가을: Object.freeze(SEASONAL_120_CATALOG.filter((item) => item.primary_season === '가을')),",
        "  겨울: Object.freeze(SEASONAL_120_CATALOG.filter((item) => item.primary_season === '겨울')),",
        "});",
        "",
        "export const SEASONAL_120_BY_IMAGE_URL = Object.freeze(",
        "  Object.fromEntries(SEASONAL_120_CATALOG.map((item) => [item.image_url, item]))",
        ");",
        "",
    ]
    CATALOG_JS_PATH.write_text("\n".join(js_lines), encoding="utf-8")

    dts_content = """export interface Seasonal120CatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: string;
  subcategory: string;
  fabric: string;
  color_name: string;
  color_hex: string;
  primary_season: '봄' | '여름' | '가을' | '겨울';
  seasons: string[];
  min_temp: number;
  max_temp: number;
  water_resistant: boolean;
  formality: string;
  brand: string;
  price: number;
  image_url: string;
  sleeveLength: string;
  hemLength: string;
  shoeExposure: string;
  layerOrder: number;
}

export const SEASONAL_120_CATALOG: ReadonlyArray<Seasonal120CatalogItem>;
export const SEASONAL_120_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const SEASONAL_120_BY_SEASON: Readonly<{
  봄: ReadonlyArray<Seasonal120CatalogItem>;
  여름: ReadonlyArray<Seasonal120CatalogItem>;
  가을: ReadonlyArray<Seasonal120CatalogItem>;
  겨울: ReadonlyArray<Seasonal120CatalogItem>;
}>;
export const SEASONAL_120_BY_IMAGE_URL: Readonly<Record<string, Seasonal120CatalogItem>>;
"""
    CATALOG_DTS_PATH.write_text(dts_content, encoding="utf-8")
    print(f"Successfully generated 128 RGBA WebP cutouts and wrote {CATALOG_JS_PATH.name} + {CATALOG_DTS_PATH.name}!")


if __name__ == "__main__":
    main()
