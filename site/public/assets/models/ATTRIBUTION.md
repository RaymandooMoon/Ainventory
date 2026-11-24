# 3D Asset Attributions (`site/public/assets/models/`)

The 3D showroom GLB assets in this directory are derived from open-licensed models sourced via Hugging Face (`codepawl/objaverse-clean-glb`) and refined, rigged/animated, and WebP-optimized in Blender 4.0.2 (`mcp-for-blender`).

| Local Asset | Original Work | Creator | Source | License | Modifications |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hf-fashion-avatar-v1.glb` | *Jessica - LOD Lady character* | [Egunoff](https://sketchfab.com/egunoff) | [Hugging Face (`codepawl/objaverse-clean-glb`)](https://huggingface.co/datasets/codepawl/objaverse-clean-glb) / [Sketchfab](https://sketchfab.com/3d-models/9a567132f9524cc7ad9d4f71b770f892) | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | Removed proxy sphere, normalized height (`1.80 m`) & ground contact (`Z = 0`), tuned PBR roughness for Three.js `RoomEnvironment`, authored cyclic `Stand` / `Walk` / `Rain` skeletal animation clips in Blender 4.0.2, WebP texture compression. |
| `hf-couture-coat-v1.glb` | *Tan Woman's Coat* | [nicoletabb](https://sketchfab.com/nicoletabb) | [Hugging Face (`codepawl/objaverse-clean-glb`)](https://huggingface.co/datasets/codepawl/objaverse-clean-glb) / [Sketchfab](https://sketchfab.com/3d-models/e31287fefdfb444aaae36ce68fa5ce16) | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | Tailored onto custom obsidian couture bust & brushed champagne-gold `iNVTRY` hanger hook / plinth stand in Blender 4.0.2, tuned metallic buttons & wool sheen, WebP texture compression. |
| `studio-mannequin-v1.glb` | *Ainventory Baseline 20-Bone Mannequin* | Ainventory Studio | Internal procedural / CC0 asset | CC0-1.0 | Retained as lightweight fallback baseline. |
