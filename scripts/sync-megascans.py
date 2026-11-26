#!/usr/bin/env python3
"""
sync-megascans.py
---------------------------------------------------------------------------
Legal, official-workflow Drop-In optimizer for Quixel Megascans (Fab Standard
License) assets downloaded manually from Fab.com into `.megascans-inbox/`.

Features:
- Accepts extracted folders OR raw `.zip` archives dropped directly from Fab.com
- Auto-detects Albedo/BaseColor, Normal (GL/DX), ORM/ORDp, AO, Roughness,
  Gloss (auto-inverted to Roughness), Metalness, Displacement, and `.glb`
- Automatically converts DirectX normal maps (G-channel inverted) -> OpenGL
- Packs separate AO(R) + Roughness(G) + Metalness(B) into a single ORM WebP
  (cutting GPU samplers, VRAM, and HTTP requests by ~66%)
- Emits two web-optimized WebP resolution tiers:
    * desktop (default 1024px)
    * mobile  (default 512px)
- Writes strict v1 `manifest.json` validated by `megascansCatalog.ts`
- Mirrors outputs to both `site/public/assets/megascans` and
  `public/assets/megascans` (both gitignored for public-repo license safety)
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INBOX_DIR = REPO_ROOT / ".megascans-inbox"
DEFAULT_OUT_DIRS = [
    REPO_ROOT / "site" / "public" / "assets" / "megascans",
    REPO_ROOT / "public" / "assets" / "megascans",
]

SLOT_SPECS: Dict[str, Dict[str, Any]] = {
    "showroom-pedestal": {
        "label": "Showroom Turntable Pedestal (Obsidian / Nero Marble)",
        "fab_keywords": ["Black Marble", "Honed Basalt", "Polished Dark Marble"],
        "repeat": [2, 2],
        "normalStrength": 0.72,
        "aoMapIntensity": 0.65,
        "preserveOriginalAlbedo": False,
        "defaultMetalness": 20,
        "defaultRoughness": 96,
    },
    "specs-floor": {
        "label": "Specs Stage Reflective Floor (Polished Concrete / Terrazzo)",
        "fab_keywords": ["Polished Concrete", "Dark Terrazzo", "Venetian Plaster"],
        "repeat": [3.5, 3.5],
        "normalStrength": 0.55,
        "aoMapIntensity": 0.55,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 28,
        "defaultRoughness": 72,
    },
    "atelier-fabric": {
        "label": "Showroom Couture Coat & Avatar Fabric (Wool / Twill Weave)",
        "fab_keywords": ["Wool Fabric", "Twill Fabric", "Tailored Linen"],
        "repeat": [4, 4],
        "normalStrength": 0.62,
        "aoMapIntensity": 0.5,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 0,
        "defaultRoughness": 204,
    },
    "fitting-floor-stone": {
        "label": "Fitting Studio Indoor Stone Floor (Travertine / Concrete)",
        "fab_keywords": ["Travertine Stone", "Architectural Concrete", "Honed Limestone"],
        "repeat": [3, 3],
        "normalStrength": 0.68,
        "aoMapIntensity": 0.5,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 12,
        "defaultRoughness": 178,
    },
    "fitting-floor-oak": {
        "label": "Fitting Studio Indoor Oak Floor (Herringbone Oak Parquet)",
        "fab_keywords": ["Herringbone Oak Parquet", "Oak Wood Planks", "Pale Hardwood Floor"],
        "repeat": [3, 3],
        "normalStrength": 0.7,
        "aoMapIntensity": 0.55,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 4,
        "defaultRoughness": 152,
    },
    "fitting-floor-outdoor": {
        "label": "Fitting Studio Outdoor Paving (Granite / Slate)",
        "fab_keywords": ["Granite Paving", "Slate Courtyard Tiles", "Cobblestone Paving"],
        "repeat": [3.2, 3.2],
        "normalStrength": 0.78,
        "aoMapIntensity": 0.55,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 12,
        "defaultRoughness": 186,
    },
    "gacha-plinth": {
        "label": "Store Gacha Stone Plinth (Honed Limestone / Travertine)",
        "fab_keywords": ["Honed Limestone", "Travertine Marble", "Dark Basalt Stone"],
        "repeat": [2.2, 2.2],
        "normalStrength": 0.74,
        "aoMapIntensity": 0.65,
        "preserveOriginalAlbedo": False,
        "defaultMetalness": 14,
        "defaultRoughness": 198,
    },
    "gacha-metal": {
        "label": "Store Gacha Brushed Metal (Brushed Brass / Anodized)",
        "fab_keywords": ["Brushed Brass", "Brushed Metal", "Anodized Aluminum"],
        "repeat": [2, 2],
        "normalStrength": 0.45,
        "aoMapIntensity": 0.4,
        "preserveOriginalAlbedo": True,
        "defaultMetalness": 240,
        "defaultRoughness": 52,
    },
}

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".tga", ".bmp"}
IGNORED_PREVIEW_RE = re.compile(
    r"(?:^|[_\-\s/])(preview|thumb|thumbnail|render|turntable|icon)(?:[_\-\s.]|$)",
    re.IGNORECASE,
)


def classify_texture(filename: str) -> Optional[Tuple[str, Optional[str], bool]]:
    """
    Returns (role, normal_convention, is_gloss) or None.
    Mirrors `classifyMegascansTextureRole` in `src/three/megascans/megascansCatalog.ts`.
    """
    p = Path(filename)
    ext = p.suffix.lower()
    if ext not in IMAGE_EXTS:
        return None
    stem = p.stem
    if IGNORED_PREVIEW_RE.search(stem):
        return None
    norm = stem.lower()

    if re.search(r"(?:^|[_\-\s])ordp(?:[_\-\s]|$)", norm):
        return ("ordp", None, False)
    if re.search(r"(?:^|[_\-\s])(orm|occlusionroughnessmetallic|metallicroughness)(?:[_\-\s]|$)", norm):
        return ("orm", None, False)
    if re.search(r"(?:^|[_\-\s])(normaldx|normal[_\-\s]?dx|dx[_\-\s]?normal)(?:[_\-\s]|$)", norm):
        return ("normal", "directx", False)
    if re.search(r"(?:^|[_\-\s])(normalgl|normal[_\-\s]?gl|gl[_\-\s]?normal)(?:[_\-\s]|$)", norm):
        return ("normal", "opengl", False)
    if re.search(r"(?:^|[_\-\s])(normal|norm|nrm)(?:[_\-\s]|$)", norm):
        is_dx = bool(re.search(r"(?:^|[_\-\s])(dx|directx)(?:[_\-\s]|$)", norm))
        return ("normal", "directx" if is_dx else "opengl", False)
    if re.search(r"(?:^|[_\-\s])(albedo|base[_\-\s]?color|diffuse|color|col|diff)(?:[_\-\s]|$)", norm):
        return ("albedo", None, False)
    if re.search(r"(?:^|[_\-\s])(gloss|glossiness|smoothness)(?:[_\-\s]|$)", norm):
        return ("roughness", None, True)
    if re.search(r"(?:^|[_\-\s])(roughness|rough|rgh)(?:[_\-\s]|$)", norm):
        return ("roughness", None, False)
    if re.search(r"(?:^|[_\-\s])(ao|ambient[_\-\s]?occlusion|occlusion|cavity)(?:[_\-\s]|$)", norm):
        return ("ao", None, False)
    if re.search(r"(?:^|[_\-\s])(metalness|metallic|metal|met)(?:[_\-\s]|$)", norm):
        return ("metalness", None, False)
    if re.search(r"(?:^|[_\-\s])(displacement|disp|height|bump)(?:[_\-\s]|$)", norm):
        return ("displacement", None, False)
    return None


def resolution_priority(filename: str) -> int:
    """Prefer LOD0 / 2K / 4K over low-res LODs when multiple files share a role."""
    low = filename.lower()
    score = 0
    if "lod0" in low:
        score += 50
    elif "lod1" in low:
        score += 20
    if "4k" in low:
        score += 30
    elif "2k" in low:
        score += 25
    elif "8k" in low:
        score += 15
    elif "1k" in low:
        score += 10
    if filename.lower().endswith(".png"):
        score += 5
    return score


def resize_square_contain(img: Image.Image, target_size: int) -> Image.Image:
    w, h = img.size
    if w <= target_size and h <= target_size:
        return img.copy()
    scale = min(target_size / float(w), target_size / float(h))
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def convert_normal_to_opengl(img: Image.Image, flip_y: bool) -> Image.Image:
    rgb = img.convert("RGB")
    if not flip_y:
        return rgb
    r, g, b = rgb.split()
    g_inv = ImageOps.invert(g)
    return Image.merge("RGB", (r, g_inv, b))


def load_grayscale_channel(
    img: Optional[Image.Image],
    size: Tuple[int, int],
    default_value: int,
    invert: bool = False,
) -> Image.Image:
    if img is None:
        return Image.new("L", size, default_value)
    gray = img.convert("L")
    if gray.size != size:
        gray = gray.resize(size, Image.Resampling.LANCZOS)
    if invert:
        gray = ImageOps.invert(gray)
    return gray


def build_orm_image(
    found_images: Dict[str, Tuple[Image.Image, Dict[str, Any]]],
    target_size: int,
    spec: Dict[str, Any],
) -> Optional[Image.Image]:
    if "orm" in found_images:
        orm_img = resize_square_contain(found_images["orm"][0].convert("RGB"), target_size)
        return orm_img

    has_any = any(k in found_images for k in ("ao", "roughness", "metalness", "ordp"))
    if not has_any:
        return None

    # Determine canonical target size from whichever map is present
    ref_img = None
    for key in ("roughness", "ao", "metalness", "ordp"):
        if key in found_images:
            ref_img = resize_square_contain(found_images[key][0], target_size)
            break
    assert ref_img is not None
    canvas_size = ref_img.size

    if "ordp" in found_images:
        # Quixel legacy ORDp: R=AO, G=Roughness, B=Displacement -> remap B to Metalness
        ordp_rgb = resize_square_contain(found_images["ordp"][0].convert("RGB"), target_size)
        if ordp_rgb.size != canvas_size:
            ordp_rgb = ordp_rgb.resize(canvas_size, Image.Resampling.LANCZOS)
        r_ch, g_ch, _disp = ordp_rgb.split()
        b_ch = load_grayscale_channel(
            found_images["metalness"][0] if "metalness" in found_images else None,
            canvas_size,
            int(spec["defaultMetalness"]),
        )
        return Image.merge("RGB", (r_ch, g_ch, b_ch))

    ao_ch = load_grayscale_channel(
        found_images["ao"][0] if "ao" in found_images else None,
        canvas_size,
        255,
    )
    rough_entry = found_images.get("roughness")
    rough_ch = load_grayscale_channel(
        rough_entry[0] if rough_entry else None,
        canvas_size,
        int(spec["defaultRoughness"]),
        invert=bool(rough_entry and rough_entry[1].get("is_gloss")),
    )
    metal_ch = load_grayscale_channel(
        found_images["metalness"][0] if "metalness" in found_images else None,
        canvas_size,
        int(spec["defaultMetalness"]),
    )
    return Image.merge("RGB", (ao_ch, rough_ch, metal_ch))


def collect_slot_sources(slot_dir: Path) -> Tuple[Dict[str, Tuple[Image.Image, Dict[str, Any]]], Optional[Path], str]:
    """
    Scans a slot directory (including nested folders & Fab `.zip` files),
    returning the best image per PBR role, an optional `.glb` path, and asset name.
    """
    candidates: Dict[str, Tuple[int, str, bytes, Dict[str, Any]]] = {}
    glb_path: Optional[Path] = None
    inferred_name = slot_dir.name

    for entry in sorted(slot_dir.rglob("*")):
        if not entry.is_file():
            continue
        lower_ext = entry.suffix.lower()

        if lower_ext == ".glb" and glb_path is None:
            glb_path = entry
            continue

        if lower_ext == ".zip":
            if inferred_name == slot_dir.name:
                inferred_name = entry.stem
            try:
                with zipfile.ZipFile(entry, "r") as zf:
                    for member in zf.infolist():
                        if member.is_dir():
                            continue
                        if member.file_size > 128 * 1024 * 1024:
                            continue
                        cls = classify_texture(member.filename)
                        if cls is None:
                            continue
                        role, normal_conv, is_gloss = cls
                        prio = resolution_priority(member.filename)
                        prev = candidates.get(role)
                        if prev is None or prio > prev[0]:
                            candidates[role] = (
                                prio,
                                member.filename,
                                zf.read(member),
                                {"normal_conv": normal_conv, "is_gloss": is_gloss},
                            )
            except zipfile.BadZipFile:
                continue
            continue

        cls = classify_texture(entry.name)
        if cls is None:
            continue
        if inferred_name == slot_dir.name:
            inferred_name = entry.parent.name if entry.parent != slot_dir else entry.stem.split("_")[0]
        role, normal_conv, is_gloss = cls
        prio = resolution_priority(entry.name)
        prev = candidates.get(role)
        if prev is None or prio > prev[0]:
            candidates[role] = (
                prio,
                entry.name,
                entry.read_bytes(),
                {"normal_conv": normal_conv, "is_gloss": is_gloss},
            )

    loaded: Dict[str, Tuple[Image.Image, Dict[str, Any]]] = {}
    for role, (_prio, fname, raw_bytes, meta) in candidates.items():
        try:
            with Image.open(io.BytesIO(raw_bytes)) as im:
                im.load()
                loaded[role] = (im.copy(), {**meta, "source_name": fname})
        except Exception:
            continue

    return loaded, glb_path, inferred_name


def load_slot_override(slot_dir: Path) -> Dict[str, Any]:
    cfg_path = slot_dir / "slot.config.json"
    if not cfg_path.is_file():
        return {}
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def init_inbox(inbox_dir: Path) -> None:
    inbox_dir.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Ainventory Quixel Megascans Drop-In Inbox (.megascans-inbox/)",
        "#",
        "# This folder is gitignored to comply with the Fab Standard License.",
        "# Download 1K-2K Quixel Megascans from https://www.fab.com/ and drop",
        "# either the extracted texture folder or the raw .zip archive into",
        "# any slot directory below, then run: npm run megascans:sync",
        "",
    ]
    for slot_id, spec in SLOT_SPECS.items():
        (inbox_dir / slot_id).mkdir(parents=True, exist_ok=True)
        kw = ", ".join(spec["fab_keywords"])
        lines.append(f"- {slot_id}/  ({spec['label']})")
        lines.append(f"    Recommended Fab search: {kw}")
    (inbox_dir / "README.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def sync_slot(
    slot_id: str,
    slot_dir: Path,
    stage_out_dir: Path,
    desktop_size: int,
    mobile_size: int,
    force_flip_normal_y: bool,
    webp_quality: int,
) -> Optional[Dict[str, Any]]:
    spec = SLOT_SPECS[slot_id]
    overrides = load_slot_override(slot_dir)
    found_images, glb_path, inferred_name = collect_slot_sources(slot_dir)

    if not found_images and glb_path is None:
        return None

    tiers_manifest: Dict[str, Dict[str, Any]] = {}
    for tier_name, target_size in (("desktop", desktop_size), ("mobile", mobile_size)):
        tier_dir = stage_out_dir / slot_id / tier_name
        tier_dir.mkdir(parents=True, exist_ok=True)
        tier_entry: Dict[str, Any] = {"size": target_size}

        if "albedo" in found_images:
            albedo_img = resize_square_contain(found_images["albedo"][0].convert("RGB"), target_size)
            rel = f"{slot_id}/{tier_name}/albedo.webp"
            albedo_img.save(stage_out_dir / rel, format="WEBP", quality=webp_quality, method=6)
            tier_entry["albedo"] = rel

        if "normal" in found_images:
            norm_img, norm_meta = found_images["normal"]
            should_flip = force_flip_normal_y or (norm_meta.get("normal_conv") == "directx")
            if isinstance(overrides.get("flipNormalY"), bool):
                should_flip = overrides["flipNormalY"]
            gl_norm = convert_normal_to_opengl(resize_square_contain(norm_img, target_size), should_flip)
            rel = f"{slot_id}/{tier_name}/normal.webp"
            # Higher quality for tangent-space normal maps to avoid banding artifacts
            gl_norm.save(stage_out_dir / rel, format="WEBP", quality=min(96, webp_quality + 10), method=6)
            tier_entry["normal"] = rel

        orm_img = build_orm_image(found_images, target_size, spec)
        if orm_img is not None:
            rel = f"{slot_id}/{tier_name}/orm.webp"
            orm_img.save(stage_out_dir / rel, format="WEBP", quality=min(95, webp_quality + 8), method=6)
            tier_entry["orm"] = rel

        if "displacement" in found_images:
            disp_img = resize_square_contain(found_images["displacement"][0].convert("L"), target_size)
            rel = f"{slot_id}/{tier_name}/displacement.webp"
            disp_img.save(stage_out_dir / rel, format="WEBP", quality=webp_quality, method=6)
            tier_entry["displacement"] = rel

        if len(tier_entry) > 1:
            tiers_manifest[tier_name] = tier_entry

    glb_rel: Optional[str] = None
    if glb_path is not None:
        slot_root = stage_out_dir / slot_id
        slot_root.mkdir(parents=True, exist_ok=True)
        glb_rel = f"{slot_id}/asset.glb"
        shutil.copy2(glb_path, stage_out_dir / glb_rel)

    if not tiers_manifest and glb_rel is None:
        return None

    repeat = overrides.get("repeat", spec["repeat"])
    normal_strength = overrides.get("normalStrength", spec["normalStrength"])
    ao_intensity = overrides.get("aoMapIntensity", spec["aoMapIntensity"])
    preserve_albedo = overrides.get("preserveOriginalAlbedo", spec["preserveOriginalAlbedo"])

    entry: Dict[str, Any] = {
        "assetName": str(overrides.get("assetName") or inferred_name),
        "license": str(overrides.get("license") or "Fab Standard License"),
        "normalConvention": "opengl",
        "repeat": repeat,
        "normalStrength": normal_strength,
        "aoMapIntensity": ao_intensity,
        "preserveOriginalAlbedo": preserve_albedo,
        "tiers": tiers_manifest,
    }
    if glb_rel:
        entry["glb"] = glb_rel
    return entry


def mirror_directory(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Optimize & sync Quixel Megascans for Ainventory Three.js stages")
    parser.add_argument("--inbox", type=Path, default=DEFAULT_INBOX_DIR, help="Inbox directory containing <slot-id>/ folders")
    parser.add_argument("--out", type=Path, action="append", help="Output directory (may be specified multiple times)")
    parser.add_argument("--desktop-size", type=int, default=1024, help="Max desktop WebP texture dimension (default: 1024)")
    parser.add_argument("--mobile-size", type=int, default=512, help="Max mobile WebP texture dimension (default: 512)")
    parser.add_argument("--quality", type=int, default=84, help="Base WebP quality 1..100 (default: 84)")
    parser.add_argument("--flip-normal-y", action="store_true", help="Force DirectX->OpenGL Y-channel inversion on all normals")
    parser.add_argument("--init-inbox", action="store_true", help="Create .megascans-inbox/<slot-id>/ folders and README")
    parser.add_argument("--check", action="store_true", help="Inspect inbox and print detected slots without writing files")
    args = parser.parse_args(argv)

    inbox_dir: Path = args.inbox.resolve()
    out_dirs: List[Path] = [p.resolve() for p in args.out] if args.out else DEFAULT_OUT_DIRS

    if args.init_inbox:
        init_inbox(inbox_dir)
        print(f"Initialized Megascans inbox at {inbox_dir} ({len(SLOT_SPECS)} slots).")
        return 0

    if not inbox_dir.exists():
        print(f"Megascans inbox not found at {inbox_dir}. Run `npm run megascans:init` first.")
        return 0

    if args.check:
        detected = 0
        for slot_id in SLOT_SPECS:
            slot_dir = inbox_dir / slot_id
            if not slot_dir.is_dir():
                continue
            imgs, glb, name = collect_slot_sources(slot_dir)
            if imgs or glb:
                detected += 1
                roles = ", ".join(sorted(imgs.keys()))
                print(f"[READY] {slot_id}: {name} (maps: {roles or 'none'}, glb: {'yes' if glb else 'no'})")
            else:
                print(f"[EMPTY] {slot_id}")
        print(f"Detected {detected}/{len(SLOT_SPECS)} populated Megascans slots.")
        return 0

    with tempfile.TemporaryDirectory(prefix="megascans-stage-") as tmp_str:
        stage_dir = Path(tmp_str)
        slots_manifest: Dict[str, Any] = {}

        for slot_id in SLOT_SPECS:
            slot_dir = inbox_dir / slot_id
            if not slot_dir.is_dir():
                continue
            entry = sync_slot(
                slot_id=slot_id,
                slot_dir=slot_dir,
                stage_out_dir=stage_dir,
                desktop_size=max(64, args.desktop_size),
                mobile_size=max(32, args.mobile_size),
                force_flip_normal_y=args.flip_normal_y,
                webp_quality=max(50, min(100, args.quality)),
            )
            if entry is not None:
                slots_manifest[slot_id] = entry
                print(f"Synced slot '{slot_id}' ({entry['assetName']})")

        manifest = {
            "version": 1,
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "slots": slots_manifest,
        }
        (stage_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        for target_dir in out_dirs:
            mirror_directory(stage_dir, target_dir)
            print(f"Wrote Megascans bundle -> {target_dir} ({len(slots_manifest)} active slots)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
