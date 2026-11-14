#!/usr/bin/env python3
"""
Deterministic Studio Product Cutout & Material-Differentiated Catalog Generator
for Multi-Part Accessories Sub-Tree & Jewelry Sub-Tree (13 sub-types x 5 materials = 65 RGBA WebP cutouts).

Covers:
1) Accessories (`category = 'accessory'`):
   - `umbrella` (우산·양산 — 5 materials: 원목·패브릭, 가죽 핸들, 울 체크, 동·브론즈 프레임, 실버 합금)
   - `watch` (손목시계 — 5 materials: 가죽, 18K 금, 925 은/스틸, 동/브론즈, 나토 패브릭)
   - `gloves` (장갑 — 5 materials: 가죽, 캐시미어, 울, 패브릭, 스웨이드 가죽)
   - `eyewear` (아이웨어 — 5 materials: 18K 금테, 925 은테, 동/브론즈 보잉, 아세테이트, 가죽·혼테)
   - `headwear` (모자 — 5 materials: 캐시미어, 울, 가죽, 코튼 패브릭, 린넨 패브릭)
   - `neckwear` (목·머플러 — 5 materials: 캐시미어, 울, 실크 패브릭, 가죽 볼로타이, 동 링 반다나)
   - `belt` (벨트 — 5 materials: 가죽, 18K 금 버클, 925 은 버클, 동 버클, 우븐 패브릭)
   - `bag` (가방 — 5 materials: 가죽, 패브릭, 울, 캐시미어, 은 체인 가죽)

2) Jewelry (`category = 'jewelry'`):
   - `earring` (귀걸이 — 5 materials: 18K 금, 925 은, 동/로즈골드, 담수진주·플래티넘, 가죽·오닉스)
   - `necklace` (목걸이 — 5 materials: 18K 금, 925 은, 동/브론즈, 벨벳 패브릭, 가죽 코드)
   - `bracelet` (팔찌·뱅글 — 5 materials: 18K 금, 925 은, 동/쿠퍼, 위빙 가죽, 실크 패브릭)
   - `ring` (반지 — 5 materials: 18K 금, 925 은, 동/브론즈, 플래티넘, 오닉스·실버)
   - `brooch` (브로치·코사지 — 5 materials: 18K 금, 925 은, 동/브론즈, 캐시미어, 울·가죽)
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT_DIR / "public" / "seed"
DETAIL_DIR = ROOT_DIR / "public" / "textures" / "mannequin"
CATALOG_JS_PATH = ROOT_DIR / "src" / "shared" / "accessoryJewelryCatalog.js"
CATALOG_DTS_PATH = ROOT_DIR / "src" / "shared" / "accessoryJewelryCatalog.d.ts"

OUT_W = 360
OUT_H = 480
SS = 2  # 2x supersampling for crisp anti-aliased edges
W2 = OUT_W * SS
H2 = OUT_H * SS


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.strip().lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#{:02X}{:02X}{:02X}".format(
        int(max(0, min(255, round(r)))),
        int(max(0, min(255, round(g)))),
        int(max(0, min(255, round(b)))),
    )


_DETAIL_CACHE: dict[str, np.ndarray] = {}


def load_detail_map(material: str) -> np.ndarray:
    key = material.lower()
    if key in _DETAIL_CACHE:
        return _DETAIL_CACHE[key]

    rng = np.random.default_rng(abs(hash(key)) % (2**31 - 1))
    yy, xx = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)

    if key in ("gold", "silver", "bronze", "platinum"):
        # Brushed fine directional metallic micro-grain + soft studio reflection bands
        grain = np.sin(yy * 0.55 + rng.normal(0, 0.25, (OUT_H, OUT_W))) * 0.45
        band = np.cos((xx * 0.85 - yy * 0.52) / 34.0) * 1.35 + np.sin((xx + yy * 0.4) / 19.0) * 0.55
        tex = grain * 0.35 + band
    elif key in ("leather", "suede", "onyx"):
        # Natural pebble leather / suede grain
        coarse = rng.normal(0, 1.0, (OUT_H // 3, OUT_W // 3)).astype(np.float32)
        im_c = Image.fromarray(np.clip((coarse * 32 + 128), 0, 255).astype(np.uint8), mode="L").resize(
            (OUT_W, OUT_H), Image.Resampling.BICUBIC
        )
        tex = (np.asarray(im_c, dtype=np.float32) - 128.0) / 26.0
    elif key in ("wool", "cashmere"):
        # Cozy rib/twill knit micro-weave
        knit = np.sin(xx * 1.15) * np.cos(yy * 0.95) * 1.1 + np.sin((xx + yy) * 0.45) * 0.55
        noise = rng.normal(0, 0.35, (OUT_H, OUT_W)).astype(np.float32)
        tex = knit + noise
    elif key in ("pearl",):
        # Nacre iridescent spherical sheen
        cx, cy = OUT_W * 0.46, OUT_H * 0.46
        dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / 110.0
        tex = np.cos(dist * 3.1) * 1.15
    else:
        # Crisp woven canvas / gabardine / silk fabric weave
        weave = (np.sin(xx * 1.65) + np.cos(yy * 1.65)) * 0.68
        tex = weave.astype(np.float32)

    _DETAIL_CACHE[key] = tex.astype(np.float32)
    return _DETAIL_CACHE[key]


def draw_shape_mask_and_accent(sub: str, variant_idx: int) -> tuple[Image.Image, Image.Image, Image.Image]:
    """
    Returns (primary_mask, hardware_accent_mask, inner_cutout_highlight_mask) at 360x480.
    """
    m_main = Image.new("L", (W2, H2), 0)
    m_hw = Image.new("L", (W2, H2), 0)
    m_hi = Image.new("L", (W2, H2), 0)

    d = ImageDraw.Draw(m_main)
    dh = ImageDraw.Draw(m_hw)
    di = ImageDraw.Draw(m_hi)

    cx, cy = W2 // 2, H2 // 2

    if sub == "umbrella":
        # Classic luxury umbrella silhouette (domed canopy + ferrule tip + shaft + J-hook or straight handle)
        # Canopy dome
        d.pieslice([104, 150, W2 - 104, 570], 180, 360, fill=255)
        # Scalloped bottom rim cutouts for realistic umbrella ribs
        for sx in range(118, W2 - 140, 96):
            d.ellipse([sx, 344, sx + 98, 392], fill=0)
        # Top ferrule & central shaft
        dh.rounded_rectangle([cx - 7, 102, cx + 7, 162], radius=6, fill=255)
        dh.rectangle([cx - 7, 348, cx + 7, 770], fill=255)
        d.rounded_rectangle([cx - 7, 102, cx + 7, 770], radius=5, fill=255)
        # J-curved handle (or compact cylinder on variant 4)
        if variant_idx == 4:
            d.rounded_rectangle([cx - 22, 725, cx + 22, 812], radius=14, fill=255)
            dh.rounded_rectangle([cx - 22, 725, cx + 22, 745], radius=6, fill=255)
        else:
            d.arc([cx - 7, 706, cx + 89, 822], 0, 185, fill=255, width=26)
            dh.arc([cx - 7, 706, cx + 89, 822], 0, 185, fill=220, width=24)
        # Canopy rib highlight lines
        for rx in (-150, -75, 0, 75, 150):
            di.line([(cx, 158), (cx + rx, 352)], fill=175, width=5)

    elif sub == "watch":
        # Wristwatch studio packshot: upper & lower strap + case lugs + bezel + dial + hands + crown
        strap_w = 88 if variant_idx != 1 else 96
        d.rounded_rectangle([cx - strap_w // 2, 118, cx + strap_w // 2, 842], radius=24, fill=255)
        # Buckle at top
        dh.rounded_rectangle([cx - strap_w // 2 - 8, 112, cx + strap_w // 2 + 8, 156], radius=10, fill=230)
        d.rounded_rectangle([cx - strap_w // 2 - 8, 112, cx + strap_w // 2 + 8, 156], radius=10, fill=255)
        # Strap keeper loops & holes
        di.rounded_rectangle([cx - strap_w // 2 - 4, 210, cx + strap_w // 2 + 4, 234], radius=6, fill=180)
        for hy in range(660, 790, 34):
            d.ellipse([cx - 7, hy - 7, cx + 7, hy + 7], fill=90)
        # Watch case & lugs
        case_r = 128
        d.rounded_rectangle([cx - 82, cy - 156, cx + 82, cy + 156], radius=28, fill=255)
        dh.rounded_rectangle([cx - 82, cy - 156, cx + 82, cy + 156], radius=28, fill=190)
        # Crown
        d.rounded_rectangle([cx + case_r - 6, cy - 22, cx + case_r + 22, cy + 22], radius=7, fill=255)
        dh.rounded_rectangle([cx + case_r - 6, cy - 22, cx + case_r + 22, cy + 22], radius=7, fill=255)
        # Bezel & Contrasting Dial
        d.ellipse([cx - case_r, cy - case_r, cx + case_r, cy + case_r], fill=255)
        dh.ellipse([cx - case_r + 24, cy - case_r + 24, cx + case_r - 24, cy + case_r - 24], fill=255)
        di.ellipse([cx - case_r, cy - case_r, cx + case_r, cy + case_r], outline=220, width=18)
        # Hour markers & Watch hands (cut cleanly into hardware mask so dial contrasts with hands!)
        for ang in range(0, 360, 30):
            rad = math.radians(ang)
            x1 = cx + int(math.cos(rad) * 78)
            y1 = cy + int(math.sin(rad) * 78)
            x2 = cx + int(math.cos(rad) * 96)
            y2 = cy + int(math.sin(rad) * 96)
            dh.line([(x1, y1), (x2, y2)], fill=35, width=6)
        dh.line([(cx, cy), (cx - 48, cy - 44)], fill=20, width=10)
        dh.line([(cx, cy), (cx + 66, cy - 54)], fill=20, width=8)
        dh.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=20)

    elif sub == "gloves":
        # Tailored 5-finger studio glove silhouette (clean editorial presentation)
        # Cuff & palm
        d.rounded_rectangle([cx - 106, 460, cx + 108, 815], radius=42, fill=255)
        # Ribbed cuff trim
        di.rounded_rectangle([cx - 102, 735, cx + 104, 810], radius=22, fill=145)
        # Four fingers
        fingers = [
            (cx - 102, 218, cx - 54, 495),
            (cx - 48, 168, cx + 2, 495),
            (cx + 8, 186, cx + 56, 495),
            (cx + 62, 248, cx + 108, 505),
        ]
        for fx0, fy0, fx1, fy1 in fingers:
            d.rounded_rectangle([fx0, fy0, fx1, fy1], radius=24, fill=255)
        # Angled thumb
        thumb = Image.new("L", (W2, H2), 0)
        dt = ImageDraw.Draw(thumb)
        dt.rounded_rectangle([cx - 178, 392, cx - 114, 620], radius=30, fill=255)
        thumb = thumb.rotate(-24, center=(cx - 125, 575), resample=Image.Resampling.BICUBIC)
        m_main = Image.fromarray(np.maximum(np.asarray(m_main), np.asarray(thumb)), mode="L")
        d = ImageDraw.Draw(m_main)
        # Back-of-hand three tailoring points (classic leather/knit glove stitch lines)
        for sx in (-34, 4, 42):
            di.line([(cx + sx, 515), (cx + sx, 685)], fill=150, width=5)

    elif sub == "eyewear":
        # Optical / Sunglasses front frame in crisp studio hero angle
        y_mid = cy - 10
        lens_r = 108
        lx, rx = cx - 134, cx + 134
        if variant_idx in (0, 1):
            # Round / Panto optical metal frames
            d.ellipse([lx - lens_r, y_mid - 98, lx + lens_r, y_mid + 98], outline=255, width=22)
            d.ellipse([rx - lens_r, y_mid - 98, rx + lens_r, y_mid + 98], outline=255, width=22)
            dh.ellipse([lx - lens_r, y_mid - 98, lx + lens_r, y_mid + 98], outline=220, width=16)
            dh.ellipse([rx - lens_r, y_mid - 98, rx + lens_r, y_mid + 98], outline=220, width=16)
            # Subtle tinted glass lens
            d.ellipse([lx - lens_r + 16, y_mid - 82, lx + lens_r - 16, y_mid + 82], fill=95)
            d.ellipse([rx - lens_r + 16, y_mid - 82, rx + lens_r - 16, y_mid + 82], fill=95)
        else:
            # Square / Aviator sunglasses with rich tinted lenses
            d.rounded_rectangle([lx - 116, y_mid - 92, lx + 112, y_mid + 96], radius=38, fill=245)
            d.rounded_rectangle([rx - 112, y_mid - 92, rx + 116, y_mid + 96], radius=38, fill=245)
            di.rounded_rectangle([lx - 96, y_mid - 74, lx + 92, y_mid + 76], radius=28, fill=140)
            di.rounded_rectangle([rx - 92, y_mid - 74, rx + 96, y_mid + 76], radius=28, fill=140)
        # Bridge & endpieces & folded temple hints
        d.rounded_rectangle([cx - 34, y_mid - 36, cx + 34, y_mid - 12], radius=10, fill=255)
        dh.rounded_rectangle([cx - 34, y_mid - 36, cx + 34, y_mid - 12], radius=10, fill=235)
        if variant_idx == 2:
            # Double aviator brow bar
            d.rounded_rectangle([lx - 40, y_mid - 86, rx + 40, y_mid - 70], radius=7, fill=255)
            dh.rounded_rectangle([lx - 40, y_mid - 86, rx + 40, y_mid - 70], radius=7, fill=240)
        d.rounded_rectangle([lx - 134, y_mid - 36, lx - 104, y_mid - 8], radius=8, fill=255)
        d.rounded_rectangle([rx + 104, y_mid - 36, rx + 134, y_mid - 8], radius=8, fill=255)
        # Diagonal lens reflection streak
        di.line([(lx - 58, y_mid - 52), (lx + 26, y_mid + 42)], fill=210, width=14)
        di.line([(rx - 58, y_mid - 52), (rx + 26, y_mid + 42)], fill=210, width=14)

    elif sub == "headwear":
        if variant_idx == 0:
            # Ribbed cashmere beanie with folded cuff
            d.pieslice([138, 200, W2 - 138, 690], 180, 360, fill=255)
            d.rounded_rectangle([126, 425, W2 - 126, 560], radius=36, fill=255)
            for rx in range(156, W2 - 150, 28):
                di.line([(rx, 432), (rx, 552)], fill=155, width=6)
        elif variant_idx == 1:
            # French wool beret with stem tip
            d.ellipse([112, 275, W2 - 108, 535], fill=255)
            d.rounded_rectangle([168, 495, W2 - 168, 555], radius=16, fill=255)
            d.rounded_rectangle([cx - 8, 246, cx + 14, 286], radius=6, fill=255)
            di.arc([148, 300, W2 - 148, 490], 200, 330, fill=150, width=12)
        elif variant_idx == 3:
            # Cotton baseball cap
            d.pieslice([142, 230, W2 - 142, 575], 180, 360, fill=255)
            d.ellipse([108, 392, W2 - 92, 505], fill=255)
            di.arc([120, 412, W2 - 102, 498], 0, 180, fill=165, width=10)
        else:
            # Bucket hat / sun hat
            d.polygon([(195, 250), (W2 - 195, 250), (W2 - 150, 455), (150, 455)], fill=255)
            d.ellipse([96, 415, W2 - 96, 565], fill=255)
            di.arc([152, 408, W2 - 152, 472], 0, 180, fill=165, width=12)

    elif sub == "neckwear":
        if variant_idx in (0, 1):
            # Folded luxury cashmere / wool fringed scarf
            d.rounded_rectangle([168, 145, W2 - 168, 735], radius=38, fill=255)
            d.rounded_rectangle([144, 165, W2 - 144, 415], radius=44, fill=255)
            di.rounded_rectangle([196, 395, W2 - 168, 725], radius=24, fill=145)
            # Tassel fringes at bottom
            for fx in range(178, W2 - 174, 22):
                d.rounded_rectangle([fx, 725, fx + 9, 812], radius=4, fill=255)
        elif variant_idx == 3:
            # Leather bolo tie with sculpted metal clasp & tips
            d.arc([196, 130, W2 - 196, 460], 180, 360, fill=255, width=20)
            d.line([(cx - 28, 390), (cx - 46, 780)], fill=255, width=16)
            d.line([(cx + 28, 390), (cx + 46, 780)], fill=255, width=16)
            d.ellipse([cx - 52, 340, cx + 52, 456], fill=255)
            dh.ellipse([cx - 44, 350, cx + 44, 446], fill=235)
            dh.rounded_rectangle([cx - 56, 755, cx - 36, 818], radius=8, fill=245)
            dh.rounded_rectangle([cx + 36, 755, cx + 56, 818], radius=8, fill=245)
            d.rounded_rectangle([cx - 56, 755, cx - 36, 818], radius=8, fill=255)
            d.rounded_rectangle([cx + 36, 755, cx + 56, 818], radius=8, fill=255)
        else:
            # Draped silk scarf / ring bandana
            d.polygon([(cx, 690), (126, 265), (cx, 195), (W2 - 126, 265)], fill=255)
            d.rounded_rectangle([cx - 56, 430, cx + 56, 488], radius=20, fill=255)
            dh.rounded_rectangle([cx - 56, 430, cx + 56, 488], radius=20, fill=220)
            di.line([(170, 285), (cx, 630), (W2 - 170, 285)], fill=150, width=10)

    elif sub == "belt":
        # Coiled studio belt displaying buckle + leather/woven strap loop
        d.ellipse([116, 270, W2 - 116, 690], outline=255, width=72)
        d.ellipse([148, 302, W2 - 148, 658], outline=195, width=18)
        di.ellipse([128, 282, W2 - 128, 678], outline=135, width=12)
        # Front metallic buckle
        bx0, by0, bx1, by1 = cx - 86, 424, cx + 86, 548
        d.rounded_rectangle([bx0, by0, bx1, by1], radius=22, fill=255)
        d.rounded_rectangle([bx0 + 24, by0 + 24, bx1 - 24, by1 - 24], radius=10, fill=90)
        dh.rounded_rectangle([bx0, by0, bx1, by1], radius=22, outline=255, width=24)
        # Prong
        d.rounded_rectangle([cx - 42, cy - 8, cx + 18, cy + 12], radius=6, fill=255)
        dh.rounded_rectangle([cx - 42, cy - 8, cx + 18, cy + 12], radius=6, fill=255)

    elif sub == "bag":
        # Structured luxury tote / crossbody bag packshot
        d.arc([cx - 108, 138, cx + 108, 392], 180, 360, fill=255, width=26)
        if variant_idx == 4:
            dh.arc([cx - 108, 138, cx + 108, 392], 180, 360, fill=235, width=22)
        body_top = 292
        d.rounded_rectangle([124, body_top, W2 - 124, 770], radius=46, fill=255)
        # Flap & clasp hardware
        di.rounded_rectangle([140, body_top + 14, W2 - 140, body_top + 185], radius=34, fill=145)
        d.rounded_rectangle([cx - 32, body_top + 156, cx + 32, body_top + 216], radius=14, fill=255)
        dh.rounded_rectangle([cx - 32, body_top + 156, cx + 32, body_top + 216], radius=14, fill=245)

    elif sub == "earring":
        # Studio pair / sculptural single hero earring packshot (hoop, drop, stud, pearl, cuff)
        for side_dx in (-112, 112):
            ex = cx + side_dx
            if variant_idx == 0:
                # Chunky 18K Gold Hoop
                d.ellipse([ex - 86, 290, ex + 86, 610], outline=255, width=38)
                dh.ellipse([ex - 86, 290, ex + 86, 610], outline=245, width=32)
                di.arc([ex - 72, 306, ex + 72, 594], 200, 325, fill=225, width=12)
            elif variant_idx == 1:
                # Sleek Silver Drop
                d.ellipse([ex - 26, 250, ex + 26, 304], fill=255)
                d.line([(ex, 304), (ex, 450)], fill=255, width=10)
                d.ellipse([ex - 48, 440, ex + 48, 650], fill=255)
                dh.ellipse([ex - 48, 440, ex + 48, 650], fill=235)
                di.ellipse([ex - 24, 468, ex + 6, 560], fill=220)
            elif variant_idx == 3:
                # Baroque Freshwater Pearl Stud + Drop
                d.ellipse([ex - 30, 275, ex + 30, 335], fill=255)
                dh.rounded_rectangle([ex - 10, 332, ex + 10, 384], radius=5, fill=245)
                d.rounded_rectangle([ex - 10, 332, ex + 10, 384], radius=5, fill=255)
                d.ellipse([ex - 64, 378, ex + 64, 548], fill=255)
                di.ellipse([ex - 34, 404, ex + 8, 456], fill=235)
            else:
                # Sculptural stud / ear cuff
                d.rounded_rectangle([ex - 72, 330, ex + 72, 560], radius=58, fill=255)
                d.rounded_rectangle([ex - 28, 386, ex + 28, 504], radius=24, fill=0)
                dh.rounded_rectangle([ex - 72, 330, ex + 72, 560], radius=58, outline=225, width=18)
                di.arc([ex - 58, 346, ex + 58, 544], 195, 315, fill=210, width=12)

    elif sub == "necklace":
        # Graceful necklace chain + central medallion / pendant
        d.ellipse([136, 130, W2 - 136, 648], outline=255, width=26 if variant_idx == 0 else 18)
        dh.ellipse([136, 130, W2 - 136, 648], outline=230 if variant_idx < 3 else 80, width=18)
        if variant_idx != 0:
            # Pendant drop
            d.rounded_rectangle([cx - 14, 626, cx + 14, 672], radius=8, fill=255)
            dh.rounded_rectangle([cx - 14, 626, cx + 14, 672], radius=8, fill=245)
            d.ellipse([cx - 68, 662, cx + 68, 798], fill=255)
            dh.ellipse([cx - 68, 662, cx + 68, 798], fill=225)
            di.ellipse([cx - 38, 686, cx + 18, 742], fill=220)
        else:
            # Herringbone flat gold chain sheen
            di.arc([136, 130, W2 - 136, 648], 35, 145, fill=230, width=14)

    elif sub == "bracelet":
        # Sculpted cuff bangle / link bracelet oval
        d.ellipse([116, 260, W2 - 116, 690], outline=255, width=54)
        if variant_idx == 0:
            # Open cuff gap at bottom
            d.rectangle([cx - 58, 630, cx + 58, 720], fill=0)
        if variant_idx in (0, 1, 2):
            dh.ellipse([116, 260, W2 - 116, 690], outline=235, width=42)
            if variant_idx == 0:
                dh.rectangle([cx - 58, 630, cx + 58, 720], fill=0)
        di.arc([130, 274, W2 - 130, 676], 200, 335, fill=215, width=16)

    elif sub == "ring":
        # Architectural signet / band ring angled hero shot
        d.ellipse([142, 300, W2 - 142, 690], outline=255, width=62)
        dh.ellipse([142, 300, W2 - 142, 690], outline=235, width=50)
        # Top signet bezel plateau
        d.ellipse([cx - 108, 250, cx + 108, 376], fill=255)
        dh.ellipse([cx - 108, 250, cx + 108, 376], fill=230 if variant_idx != 4 else 120)
        if variant_idx == 4:
            # Black onyx inlay stone
            d.ellipse([cx - 82, 268, cx + 82, 358], fill=255)
            dh.ellipse([cx - 98, 256, cx + 98, 370], outline=255, width=16)
        di.ellipse([cx - 72, 272, cx + 28, 332], fill=215)

    elif sub == "brooch":
        # Botanical leaf / geometric pin / cashmere rosette brooch
        if variant_idx in (3, 4):
            # Cashmere / wool floral rosette + lapel pin stem
            for ang in range(0, 360, 60):
                rad = math.radians(ang)
                px = cx + int(math.cos(rad) * 78)
                py = (cy - 40) + int(math.sin(rad) * 78)
                d.ellipse([px - 74, py - 74, px + 74, py + 74], fill=255)
                di.ellipse([px - 42, py - 42, px + 42, py + 42], fill=150)
            d.ellipse([cx - 48, cy - 88, cx + 48, cy + 8], fill=255)
            dh.line([(cx, cy + 50), (cx, 785)], fill=235, width=12)
            d.line([(cx, cy + 50), (cx, 785)], fill=255, width=12)
        else:
            # Sculpted metallic leaf / geometric cameo brooch
            d.ellipse([166, 215, W2 - 166, 665], fill=255)
            dh.ellipse([166, 215, W2 - 166, 665], fill=235)
            di.ellipse([204, 260, W2 - 204, 620], fill=195)
            dh.line([(cx, 200), (cx, 760)], fill=255, width=14)
            d.line([(cx, 200), (cx, 760)], fill=255, width=14)

    m_main_1x = m_main.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    m_hw_1x = m_hw.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    m_hi_1x = m_hi.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    return m_main_1x, m_hw_1x, m_hi_1x


def render_material_cutout(
    sub: str,
    variant_idx: int,
    target_hex: str,
    material_key: str,
    hardware_hex: str | None = None,
) -> tuple[Image.Image, str]:
    m_main, m_hw, m_hi = draw_shape_mask_and_accent(sub, variant_idx)

    alpha = np.asarray(m_main, dtype=np.float32)
    # Guarantee 0% border residue on outer 6px perimeter
    alpha[:6, :] = 0
    alpha[-6:, :] = 0
    alpha[:, :6] = 0
    alpha[:, -6:] = 0

    hw = np.asarray(m_hw.filter(ImageFilter.GaussianBlur(radius=0.8)), dtype=np.float32) / 255.0
    hi = np.asarray(m_hi.filter(ImageFilter.GaussianBlur(radius=2.2)), dtype=np.float32) / 255.0

    # Compute smooth studio 3D normal/bevel lighting from silhouette distance field
    blurred_alpha = np.asarray(
        Image.fromarray(alpha.astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(radius=9.0)),
        dtype=np.float32,
    ) / 255.0
    gy, gx = np.gradient(blurred_alpha)
    # Key light from top-left (-0.58, -0.68, 0.45)
    ndotl = np.clip(-gx * 3.4 - gy * 3.8 + 0.55, 0.15, 1.45)

    tr, tg, tb = hex_to_rgb(target_hex)
    tex = load_detail_map(material_key)
    is_metal = material_key in ("gold", "silver", "bronze", "platinum", "pearl")

    if is_metal:
        spec = np.power(np.clip(ndotl, 0.0, 1.45), 2.15) * 34.0 + hi * 42.0
        shade = 0.72 + 0.34 * ndotl
        weave_amp = 9.5
    else:
        spec = np.maximum(0.0, ndotl - 0.88) * 26.0 + hi * 22.0
        shade = 0.78 + 0.28 * ndotl
        weave_amp = 6.2

    r = tr * shade + spec + tex * weave_amp
    g = tg * shade + spec + tex * weave_amp
    b = tb * shade + spec + tex * weave_amp

    if hardware_hex:
        hr, hg, hb = hex_to_rgb(hardware_hex)
        hw_blend = np.clip(hw * 0.88, 0.0, 0.92)
        hw_spec = np.maximum(0.0, ndotl - 0.75) * 40.0
        r = r * (1.0 - hw_blend) + np.clip(hr * shade + hw_spec, 0, 255) * hw_blend
        g = g * (1.0 - hw_blend) + np.clip(hg * shade + hw_spec, 0, 255) * hw_blend
        b = b * (1.0 - hw_blend) + np.clip(hb * shade + hw_spec, 0, 255) * hw_blend

    rgba = np.zeros((OUT_H, OUT_W, 4), dtype=np.uint8)
    fg = alpha >= 10.0
    rgba[:, :, 0] = np.where(fg, np.clip(r, 0, 255), 0).astype(np.uint8)
    rgba[:, :, 1] = np.where(fg, np.clip(g, 0, 255), 0).astype(np.uint8)
    rgba[:, :, 2] = np.where(fg, np.clip(b, 0, 255), 0).astype(np.uint8)
    rgba[:, :, 3] = np.where(fg, np.clip(alpha, 0, 255), 0).astype(np.uint8)

    # Measure mean opaque foreground hex so StudioGarmentImage sees exact native color
    solid = rgba[:, :, 3] >= 160
    if np.any(solid):
        mr = float(rgba[:, :, 0][solid].mean())
        mg = float(rgba[:, :, 1][solid].mean())
        mb = float(rgba[:, :, 2][solid].mean())
        measured_hex = rgb_to_hex(mr, mg, mb)
    else:
        measured_hex = target_hex.upper()

    return Image.fromarray(rgba, mode="RGBA"), measured_hex


# 13 newly structured sub-types x 5 material-differentiated items = 65 items
# Tuple schema:
# (slug, name_ko, name_en, category, subcategory, fabric, material_key, color_ko, target_hex, hw_hex, seasons, min_t, max_t, water, formality, brand, price)
SPEC_GROUPS: list[list[tuple[Any, ...]]] = [
    # 1. Umbrella (우산·양산 — 5 materials)
    [
        ("maple-fabric-umbrella", "클래식 원목 발수 패브릭 장우산", "Classic Maple Wood Water-Repellent Fabric Umbrella", "accessory", "umbrella", "water-repellent fabric", "fabric", "네이비", "#223247", "#8B5E3C", ["봄", "여름", "가을", "겨울"], -5, 34, True, "smart", "FOX UMBRELLAS", 240000),
        ("black-leather-umbrella", "풀그레인 블랙 가죽 핸들 장우산", "Full-Grain Black Leather Handle Umbrella", "accessory", "umbrella", "leather & high-density nylon", "leather", "블랙", "#23252A", "#C4C9D0", ["봄", "여름", "가을", "겨울"], -5, 34, True, "formal", "MACKINTOSH", 265000),
        ("camel-wool-umbrella", "베이지 발수 울 트윌 체크 장우산", "Beige Water-Repellent Wool Twill Check Umbrella", "accessory", "umbrella", "water-repellent wool twill", "wool", "베이지", "#BC9F78", "#6B462B", ["봄", "가을", "겨울"], -2, 26, True, "smart", "BURBERRY", 320000),
        ("forest-bronze-umbrella", "딥그린 엔틱 동·브론즈 프레임 우산", "Deep Green Antique Bronze Frame Umbrella", "accessory", "umbrella", "bronze & waxed cotton", "bronze", "올리브", "#2E4B3E", "#AD7146", ["봄", "여름", "가을", "겨울"], 0, 32, True, "smart", "BARBOUR", 195000),
        ("slate-silver-umbrella", "슬레이트 실버 알루미늄 초경량 우산", "Slate Silver Alloy Ultralight Folding Umbrella", "accessory", "umbrella", "silver alloy & ripstop fabric", "silver", "그레이", "#687382", "#D2D7DE", ["봄", "여름", "가을", "겨울"], -5, 35, True, "casual", "SNOW PEAK", 98000),
    ],
    # 2. Watch (손목시계 — 5 materials, wearable on Left Wrist & Right Wrist!)
    [
        ("espresso-leather-watch", "에스프레소 악어가죽 드레스 시계", "Espresso Alligator Leather Dress Watch", "accessory", "watch", "leather", "leather", "브라운", "#4D3429", "#D6B247", ["봄", "여름", "가을", "겨울"], -10, 35, False, "formal", "CARTIER", 890000),
        ("yellow-gold-watch", "18K 옐로우 골드 크로노 메탈 시계", "18K Yellow Gold Chronograph Metal Watch", "accessory", "watch", "18k gold", "gold", "옐로우", "#D4AE39", "#F2DF99", ["봄", "여름", "가을", "겨울"], -10, 35, True, "smart", "OMEGA", 1250000),
        ("brushed-silver-watch", "925 브러시드 실버 스틸 필드 시계", "Brushed Silver Steel Field Watch", "accessory", "watch", "925 silver steel", "silver", "실버", "#C2C8D0", "#2B323C", ["봄", "여름", "가을", "겨울"], -10, 35, True, "smart", "IWC", 960000),
        ("vintage-bronze-watch", "빈티지 브론즈·동 케이스 파일럿 시계", "Vintage Bronze Case Pilot Watch", "accessory", "watch", "bronze", "bronze", "브라운", "#A96E46", "#2E2622", ["봄", "여름", "가을", "겨울"], -10, 35, True, "casual", "TUDOR", 780000),
        ("olive-fabric-watch", "올리브 나토 우븐 패브릭 스트랩 시계", "Olive Woven NATO Fabric Strap Watch", "accessory", "watch", "woven fabric", "fabric", "올리브", "#58654E", "#C8CED6", ["봄", "여름", "가을"], 5, 35, True, "casual", "HAMILTON", 540000),
    ],
    # 3. Gloves (장갑 — 5 materials, wearable independently on Left Hand & Right Hand!)
    [
        ("black-nappa-gloves", "블랙 나파 가죽 테일러드 장갑", "Black Nappa Leather Tailored Gloves", "accessory", "gloves", "leather", "leather", "블랙", "#24262B", None, ["가을", "겨울"], -15, 10, True, "smart", "DENTS", 185000),
        ("oatmeal-cashmere-gloves", "오트밀 퓨어 캐시미어 니트 장갑", "Oatmeal Pure Cashmere Knit Gloves", "accessory", "gloves", "cashmere", "cashmere", "베이지", "#D8CEBC", None, ["가을", "겨울"], -15, 11, False, "smart", "LORO PIANA", 290000),
        ("charcoal-wool-gloves", "차콜 메리노 울 립 장갑", "Charcoal Merino Wool Ribbed Gloves", "accessory", "gloves", "wool", "wool", "차콜", "#484C54", None, ["가을", "겨울"], -15, 10, False, "casual", "ARKET", 79000),
        ("navy-tech-fabric-gloves", "네이비 방풍 테크 패브릭 장갑", "Navy Windproof Tech Fabric Gloves", "accessory", "gloves", "windproof fabric", "fabric", "네이비", "#29394F", None, ["봄", "가을", "겨울"], -12, 12, True, "casual", "ARC'TERYX", 115000),
        ("cognac-suede-gloves", "코냑 스웨이드 가죽 스티치 장갑", "Cognac Suede Leather Stitch Gloves", "accessory", "gloves", "suede leather", "suede", "브라운", "#9E643E", None, ["가을", "겨울"], -12, 11, False, "smart", "TOD'S", 230000),
    ],
    # 4. Eyewear (아이웨어 — 5 materials)
    [
        ("gold-round-glasses", "18K 골드 티타늄 라운드 안경", "18K Gold Titanium Round Optical Glasses", "accessory", "eyewear", "18k gold titanium", "gold", "옐로우", "#D4B042", "#EDE6D4", ["봄", "여름", "가을", "겨울"], -15, 36, False, "smart", "OLIVER PEOPLES", 460000),
        ("silver-halfrim-glasses", "925 실버 슬림 메탈 안경", "925 Silver Slim Metal Optical Glasses", "accessory", "eyewear", "silver titanium", "silver", "실버", "#C5CBD3", "#E8EDF2", ["봄", "여름", "가을", "겨울"], -15, 36, False, "smart", "MYKITA", 510000),
        ("bronze-aviator-sunglasses", "빈티지 동·브론즈 보잉 선글라스", "Vintage Bronze Aviator Sunglasses", "accessory", "eyewear", "bronze metal", "bronze", "브라운", "#A56B43", "#4A3A30", ["봄", "여름", "가을"], 5, 36, False, "casual", "GENTLE MONSTER", 340000),
        ("black-acetate-sunglasses", "블랙 아세테이트 스퀘어 선글라스", "Black Acetate Square Sunglasses", "accessory", "eyewear", "acetate", "leather", "블랙", "#23252A", "#C9CFD6", ["봄", "여름", "가을", "겨울"], -5, 36, False, "smart", "CELINE", 480000),
        ("tortoise-leather-eyewear", "체스트넛 가죽 템플 혼테 선글라스", "Chestnut Leather Temple Horn Sunglasses", "accessory", "eyewear", "leather & horn", "suede", "브라운", "#6D4934", "#D4AF37", ["봄", "여름", "가을"], 5, 35, False, "smart", "JACQUES MARIE MAGE", 620000),
    ],
    # 5. Headwear (머리·모자 — 5 materials)
    [
        ("cream-cashmere-beanie", "크림 케이블 퓨어 캐시미어 비니", "Cream Cable Pure Cashmere Beanie", "accessory", "headwear", "cashmere", "cashmere", "아이보리", "#E6DFD2", None, ["가을", "겨울"], -15, 11, False, "casual", "COS", 135000),
        ("burgundy-wool-beret", "버건디 프렌치 메리노 울 베레모", "Burgundy French Merino Wool Beret", "accessory", "headwear", "wool", "wool", "버건디", "#6E2E3A", None, ["봄", "가을", "겨울"], -8, 17, False, "smart", "LAULHERE", 125000),
        ("black-leather-buckethat", "블랙 소프트 양가죽 버킷햇", "Black Soft Lambskin Leather Bucket Hat", "accessory", "headwear", "leather", "leather", "블랙", "#25272C", None, ["봄", "가을", "겨울"], -5, 20, True, "smart", "PRADA", 490000),
        ("navy-cotton-cap", "네이비 트윌 코튼 패브릭 볼캡", "Navy Twill Cotton Fabric Ball Cap", "accessory", "headwear", "cotton fabric", "fabric", "네이비", "#2C3D55", None, ["봄", "여름", "가을", "겨울"], -5, 35, False, "casual", "A.P.C.", 115000),
        ("sand-linen-sunhat", "샌드 내추럴 린넨 패브릭 선햇", "Sand Natural Linen Fabric Sun Hat", "accessory", "headwear", "linen fabric", "fabric", "베이지", "#D4C3A3", None, ["봄", "여름"], 16, 36, False, "casual", "JACQUEMUS", 195000),
    ],
    # 6. Neckwear (목·머플러·스카프 — 5 materials)
    [
        ("ivory-cashmere-muffler", "아이보리 퓨어 캐시미어 프린지 머플러", "Ivory Pure Cashmere Fringe Scarf", "accessory", "neckwear", "cashmere", "cashmere", "아이보리", "#EAE3D6", None, ["가을", "겨울"], -15, 12, False, "smart", "ACNE STUDIOS", 360000),
        ("forest-wool-muffler", "포레스트 스코티시 램스울 머플러", "Forest Scottish Lambswool Scarf", "accessory", "neckwear", "wool", "wool", "올리브", "#395446", None, ["가을", "겨울"], -15, 11, False, "smart", "BEGG X CO", 240000),
        ("midnight-silk-scarf", "미드나잇 트윌 실크 패브릭 스카프", "Midnight Twill Silk Fabric Scarf", "accessory", "neckwear", "silk fabric", "fabric", "네이비", "#29384F", "#D4AF37", ["봄", "여름", "가을"], 8, 28, False, "smart", "HERMES", 450000),
        ("espresso-leather-bolotie", "에스프레소 브레이드 가죽 볼로 타이", "Espresso Braided Leather Bolo Tie", "accessory", "neckwear", "leather", "leather", "브라운", "#4D3529", "#C5CBD3", ["봄", "여름", "가을", "겨울"], -5, 32, False, "smart", "SAINT LAURENT", 310000),
        ("terracotta-bronze-bandana", "테라코타 동·브론즈 링 코튼 스카프", "Terracotta Bronze Ring Cotton Scarf", "accessory", "neckwear", "cotton & bronze", "bronze", "브라운", "#9E6342", "#B5784B", ["봄", "여름", "가을"], 10, 30, False, "casual", "KAPITAL", 145000),
    ],
    # 7. Belt (허리·벨트 — 5 materials)
    [
        ("black-leather-belt", "블랙 풀그레인 카프스킨 가죽 벨트", "Black Full-Grain Calfskin Leather Belt", "accessory", "belt", "leather", "leather", "블랙", "#24262B", "#C8CED6", ["봄", "여름", "가을", "겨울"], -15, 35, False, "formal", "LEMAIRE", 270000),
        ("gold-buckle-belt", "18K 골드 버클 에스프레소 벨트", "18K Gold Buckle Espresso Dress Belt", "accessory", "belt", "18k gold & leather", "gold", "옐로우", "#C9A338", "#4A3328", ["봄", "여름", "가을", "겨울"], -15, 35, False, "formal", "CELINE", 420000),
        ("silver-western-belt", "925 실버 조각 버클 레더 벨트", "925 Silver Sculpted Buckle Belt", "accessory", "belt", "925 silver & leather", "silver", "실버", "#C0C6CE", "#292B30", ["봄", "여름", "가을", "겨울"], -15, 35, False, "smart", "OUR LEGACY", 250000),
        ("bronze-ring-belt", "엔틱 동·브론즈 더블링 벨트", "Antique Bronze Double-Ring Belt", "accessory", "belt", "bronze & suede", "bronze", "브라운", "#A46B43", "#6B4935", ["봄", "여름", "가을", "겨울"], -10, 35, False, "casual", "RRL", 230000),
        ("sand-woven-fabric-belt", "샌드 우븐 캔버스 패브릭 벨트", "Sand Woven Canvas Fabric Belt", "accessory", "belt", "woven fabric", "fabric", "베이지", "#C6B597", "#B8BFC7", ["봄", "여름", "가을"], 8, 36, False, "casual", "ANDERSON'S", 165000),
    ],
    # 8. Bag (가방·휴대 — 5 materials)
    [
        ("black-saddle-leather-bag", "블랙 새들 풀그레인 가죽 크로스백", "Black Saddle Full-Grain Leather Crossbody Bag", "accessory", "bag", "leather", "leather", "블랙", "#24262B", "#D4AF37", ["봄", "여름", "가을", "겨울"], -15, 35, True, "smart", "LEMAIRE", 680000),
        ("ecru-canvas-fabric-tote", "에크루 헤비 캔버스 패브릭 토트백", "Ecru Heavy Canvas Fabric Tote Bag", "accessory", "bag", "canvas fabric", "fabric", "아이보리", "#E4DDD0", "#6B4B36", ["봄", "여름", "가을"], 5, 36, False, "casual", "JIL SANDER", 540000),
        ("charcoal-wool-briefcase", "차콜 메리노 울 펠트 브리프백", "Charcoal Merino Wool Felt Brief Bag", "accessory", "bag", "wool", "wool", "차콜", "#4A4E56", "#C2C8D0", ["가을", "겨울"], -15, 16, False, "smart", "THOM BROWNE", 720000),
        ("camel-cashmere-pouchbag", "카멜 소프트 캐시미어 니트 숄더백", "Camel Soft Cashmere Knit Shoulder Bag", "accessory", "bag", "cashmere", "cashmere", "카멜", "#C39D6F", "#D6B245", ["가을", "겨울"], -15, 16, False, "smart", "THE ROW", 890000),
        ("silver-chain-mini-bag", "925 실버 체인 메탈릭 미니백", "925 Silver Chain Metallic Mini Bag", "accessory", "bag", "silver & leather", "silver", "실버", "#C0C6CE", "#E4E8EE", ["봄", "여름", "가을", "겨울"], -10, 35, False, "formal", "MAISON MARGIELA", 840000),
    ],
    # 9. Jewelry — Earring (귀걸이 — 5 materials, wearable on Left Ear & Right Ear!)
    [
        ("gold-hoop-earring", "18K 옐로우 골드 볼드 후프 귀걸이", "18K Yellow Gold Bold Hoop Earring", "jewelry", "earring", "18k gold", "gold", "옐로우", "#D8B33E", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "BOTTEGA VENETA", 520000),
        ("silver-drop-earring", "925 스털링 실버 슬릭 드롭 귀걸이", "925 Sterling Silver Sleek Drop Earring", "jewelry", "earring", "925 silver", "silver", "실버", "#C9CFD7", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "GEORG JENSEN", 340000),
        ("bronze-sculpt-earring", "로즈 브론즈·동 스컬프처 귀걸이", "Rose Bronze Sculptural Stud Earring", "jewelry", "earring", "bronze", "bronze", "브라운", "#B77751", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "CHARLOTTE CHESNAIS", 390000),
        ("pearl-platinum-earring", "바로크 담수진주 플래티넘 귀걸이", "Baroque Freshwater Pearl Platinum Earring", "jewelry", "earring", "pearl & platinum", "pearl", "화이트", "#ECE7DE", "#D5DBE2", ["봄", "여름", "가을", "겨울"], -15, 36, False, "formal", "TASAKI", 680000),
        ("leather-onyx-earcuff", "블랙 가죽 인레이 오닉스 이어커프", "Black Leather Inlay Onyx Ear Cuff", "jewelry", "earring", "leather & onyx", "onyx", "블랙", "#27292E", "#C6CCD4", ["봄", "여름", "가을", "겨울"], -15, 36, True, "casual", "TOM WOOD", 280000),
    ],
    # 10. Jewelry — Necklace (목걸이·펜던트 — 5 materials)
    [
        ("gold-herringbone-necklace", "18K 골드 헤링본 체인 목걸이", "18K Gold Herringbone Chain Necklace", "jewelry", "necklace", "18k gold", "gold", "옐로우", "#D7B23C", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "TIFFANY & CO.", 920000),
        ("silver-pebble-necklace", "925 스털링 실버 페블 펜던트 목걸이", "925 Sterling Silver Pebble Pendant Necklace", "jewelry", "necklace", "925 silver", "silver", "실버", "#C7CDD5", "#DCE1E8", ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "ALL BLUES", 410000),
        ("bronze-coin-necklace", "엔틱 동·브론즈 코인 메달 목걸이", "Antique Bronze Coin Medallion Necklace", "jewelry", "necklace", "bronze", "bronze", "브라운", "#AA6F46", "#C88B61", ["봄", "여름", "가을", "겨울"], -15, 36, True, "casual", "ALIGHIERI", 360000),
        ("velvet-fabric-choker", "미드나잇 벨벳 패브릭 펜던트 초커", "Midnight Velvet Fabric Pendant Choker", "jewelry", "necklace", "velvet fabric & silver", "fabric", "네이비", "#2C2E42", "#CFD5DC", ["봄", "가을", "겨울"], -10, 26, False, "formal", "SAINT LAURENT", 380000),
        ("brown-leather-cord-necklace", "다크브라운 가죽 코드 실버 링 목걸이", "Dark Brown Leather Cord Silver Ring Necklace", "jewelry", "necklace", "leather & 925 silver", "leather", "브라운", "#4E3529", "#C9CFD7", ["봄", "여름", "가을", "겨울"], -15, 36, False, "casual", "HERMES", 590000),
    ],
    # 11. Jewelry — Bracelet (팔찌·뱅글 — 5 materials, wearable on Left Wrist & Right Wrist!)
    [
        ("gold-open-cuff-bracelet", "18K 골드 아키텍처 오픈 커프 뱅글", "18K Gold Architectural Open Cuff Bangle", "jewelry", "bracelet", "18k gold", "gold", "옐로우", "#D6B13B", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "CARTIER", 1150000),
        ("silver-link-bracelet", "925 스털링 실버 볼드 체인 팔찌", "925 Sterling Silver Bold Link Bracelet", "jewelry", "bracelet", "925 silver", "silver", "실버", "#C6CCD4", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "TOM WOOD", 430000),
        ("copper-bronze-bangle", "해머드 동·쿠퍼 아티산 트위스트 뱅글", "Hammered Copper Bronze Artisan Bangle", "jewelry", "bracelet", "copper bronze", "bronze", "브라운", "#B27046", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "casual", "WORKSTATT MUNCHEN", 320000),
        ("woven-leather-bracelet", "위빙 이탈리안 가죽 더블 랩 팔찌", "Woven Italian Leather Double-Wrap Bracelet", "jewelry", "bracelet", "leather", "leather", "브라운", "#432F25", "#C8CED6", ["봄", "여름", "가을", "겨울"], -15, 36, False, "casual", "BOTTEGA VENETA", 390000),
        ("silk-cord-fabric-bracelet", "우븐 실크 패브릭 코드 브레이슬릿", "Woven Silk Fabric Cord Bracelet", "jewelry", "bracelet", "silk fabric", "fabric", "네이비", "#324A60", "#D6B242", ["봄", "여름", "가을"], 5, 36, True, "casual", "FRED", 420000),
    ],
    # 12. Jewelry — Ring (반지 — 5 materials, wearable on Left Hand & Right Hand!)
    [
        ("gold-oval-signet-ring", "18K 골드 오벌 시그넷 반지", "18K Gold Oval Signet Ring", "jewelry", "ring", "18k gold", "gold", "옐로우", "#D7B23C", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "TOM WOOD", 640000),
        ("silver-layered-ring", "925 스털링 실버 트윈 레이어드 반지", "925 Sterling Silver Twin Layered Ring", "jewelry", "ring", "925 silver", "silver", "실버", "#C9CFD7", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "SPINNELLI KILCOLLIN", 520000),
        ("bronze-textured-ring", "엔틱 동·브론즈 해머드 밴드 반지", "Antique Bronze Hammered Band Ring", "jewelry", "ring", "bronze", "bronze", "브라운", "#AA6E46", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "casual", "BLEUE BURNHAM", 290000),
        ("platinum-dome-ring", "플래티넘 브러시드 볼륨 돔 반지", "Platinum Brushed Volume Dome Ring", "jewelry", "ring", "platinum", "platinum", "실버", "#D5DBE2", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "formal", "BOUCHERON", 980000),
        ("black-onyx-signet-ring", "블랙 오닉스 스털링 인장 반지", "Black Onyx Sterling Cushion Signet Ring", "jewelry", "ring", "onyx & 925 silver", "onyx", "블랙", "#2A2C32", "#C8CED6", ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "TOM WOOD", 560000),
    ],
    # 13. Jewelry — Brooch (브로치·코사지 — 5 materials)
    [
        ("gold-botanical-brooch", "18K 골드 보태니컬 리프 브로치", "18K Gold Botanical Leaf Brooch", "jewelry", "brooch", "18k gold", "gold", "옐로우", "#D6B13C", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "formal", "LOEWE", 470000),
        ("silver-geometric-pin", "925 실버 모던 지오메트릭 라펠 핀", "925 Silver Modern Geometric Lapel Pin", "jewelry", "brooch", "925 silver", "silver", "실버", "#C7CDD5", None, ["봄", "여름", "가을", "겨울"], -15, 36, True, "smart", "JIL SANDER", 350000),
        ("bronze-cameo-brooch", "엔틱 동·브론즈 스컬프처 브로치", "Antique Bronze Sculpted Cameo Brooch", "jewelry", "brooch", "bronze", "bronze", "브라운", "#A76C44", None, ["봄", "가을", "겨울"], -15, 28, True, "smart", "MARNI", 310000),
        ("cashmere-flower-corsage", "퓨어 캐시미어 로제트 플라워 코사지", "Pure Cashmere Rosette Flower Corsage", "jewelry", "brooch", "cashmere", "cashmere", "아이보리", "#E4DCCE", "#D6B242", ["봄", "가을", "겨울"], -15, 22, False, "formal", "CHANEL", 590000),
        ("wool-leather-boutonniere", "멜란지 울 펠트 & 가죽 부토니에", "Melange Wool Felt & Leather Boutonniere", "jewelry", "brooch", "wool & leather", "wool", "네이비", "#394658", "#8A5B3C", ["봄", "가을", "겨울"], -15, 24, False, "smart", "LARDINI", 165000),
    ],
]


def main() -> None:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    catalog_entries: list[dict[str, Any]] = []
    global_idx = 0

    for group in SPEC_GROUPS:
        assert len(group) == 5, f"Each subcategory group MUST have 5 material items, got {len(group)}"
        for v_idx, item in enumerate(group):
            global_idx += 1
            (
                slug,
                name_ko,
                name_en,
                cat,
                sub,
                fabric,
                mat_key,
                color_ko,
                target_hex,
                hw_hex,
                seasons,
                min_t,
                max_t,
                water,
                formality,
                brand,
                price,
            ) = item

            filename = f"s5-{global_idx:02d}-{slug}.webp"
            out_path = SEED_DIR / filename
            image_url = f"/seed/{filename}"

            img_rgba, measured_hex = render_material_cutout(
                sub=sub,
                variant_idx=v_idx,
                target_hex=target_hex,
                material_key=mat_key,
                hardware_hex=hw_hex,
            )
            img_rgba.save(out_path, format="WEBP", quality=88, method=4)

            # Re-verify saved WebP alpha hygiene & true foreground hex
            reloaded = np.asarray(Image.open(out_path).convert("RGBA"))
            border_alpha = max(
                int(reloaded[:2, :, 3].max()),
                int(reloaded[-2:, :, 3].max()),
                int(reloaded[:, :2, 3].max()),
                int(reloaded[:, -2:, 3].max()),
            )
            assert border_alpha == 0, f"Border alpha residue {border_alpha} in {filename}"
            solid = reloaded[:, :, 3] >= 160
            if np.any(solid):
                measured_hex = rgb_to_hex(
                    float(reloaded[:, :, 0][solid].mean()),
                    float(reloaded[:, :, 1][solid].mean()),
                    float(reloaded[:, :, 2][solid].mean()),
                )

            catalog_entries.append(
                {
                    "key": f"s5_{global_idx:02d}_{slug.replace('-', '_')}",
                    "idOffset": 200 + global_idx,
                    "name": name_ko,
                    "name_en": name_en,
                    "category": cat,
                    "subcategory": sub,
                    "fabric": fabric,
                    "material_key": mat_key,
                    "color_name": color_ko,
                    "color_hex": measured_hex,
                    "primary_season": seasons[0],
                    "seasons": list(seasons),
                    "min_temp": int(min_t),
                    "max_temp": int(max_t),
                    "water_resistant": bool(water),
                    "formality": formality,
                    "brand": brand,
                    "price": int(price),
                    "image_url": image_url,
                    "sleeveLength": "none",
                    "hemLength": "none",
                    "shoeExposure": "open",
                    "layerOrder": 70 if cat == "jewelry" else 65,
                }
            )

    assert len(catalog_entries) == 65, f"Expected 65 items, got {len(catalog_entries)}"

    js_lines = [
        "/**",
        " * Multi-Part Accessories & Jewelry Material-Differentiated Seed Catalog (13 sub-types x 5 materials = 65 items).",
        " * Generated deterministically by `scripts/generate-accessory-jewelry-assets.py`.",
        " * Automatically seeds 5 items by material (leather, fabric, wool, cashmere, 18K gold, 925 silver, bronze, etc.)",
        " * whenever a newly created category or body-part sub-slot has zero existing items.",
        " */",
        "",
        f"export const ACCESSORY_JEWELRY_CATALOG = Object.freeze({json.dumps(catalog_entries, ensure_ascii=False, indent=2)});",
        "",
        "export const ACCESSORY_JEWELRY_NATIVE_HEX_MAP = Object.freeze(",
        "  Object.fromEntries(ACCESSORY_JEWELRY_CATALOG.map((item) => [item.image_url, item.color_hex]))",
        ");",
        "",
        "export const ACCESSORY_JEWELRY_BY_SUBCATEGORY = Object.freeze(",
        "  ACCESSORY_JEWELRY_CATALOG.reduce((acc, item) => {",
        "    if (!acc[item.subcategory]) acc[item.subcategory] = [];",
        "    acc[item.subcategory].push(item);",
        "    return acc;",
        "  }, {})",
        ");",
        "",
    ]
    CATALOG_JS_PATH.write_text("\n".join(js_lines), encoding="utf-8")

    dts_content = """export interface AccessoryJewelryCatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: 'accessory' | 'jewelry';
  subcategory: string;
  fabric: string;
  material_key: string;
  color_name: string;
  color_hex: string;
  primary_season: string;
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

export const ACCESSORY_JEWELRY_CATALOG: ReadonlyArray<AccessoryJewelryCatalogItem>;
export const ACCESSORY_JEWELRY_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const ACCESSORY_JEWELRY_BY_SUBCATEGORY: Readonly<Record<string, ReadonlyArray<AccessoryJewelryCatalogItem>>>;
"""
    CATALOG_DTS_PATH.write_text(dts_content, encoding="utf-8")
    print(f"Generated {len(catalog_entries)} studio cutouts and wrote {CATALOG_JS_PATH.name} + {CATALOG_DTS_PATH.name}!")


if __name__ == "__main__":
    main()
