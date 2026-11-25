---
trigger: always_on
---
> This file extends [design-quality.md](design-quality.md) with the project-wide **Stitch-First UI Design** mandate.

# Stitch-First UI Design Rule (필수 법칙)

**앞으로 Ainventory의 모든 UI 디자인은 반드시 Google Stitch를 통해 진행한다.**
All new or changed UI design (screens, layouts, components, visual redesigns) MUST be designed in Google Stitch first. Code is written only after a Stitch design has been chosen by the user.

## Scope

- Applies to: new screens, layout changes, component redesigns, theme/visual-direction changes, responsive variants.
- Does not apply to: pure bug fixes, accessibility/logic fixes, or copy tweaks that do not alter layout or visual design.

## Mandatory Workflow

1. **Design in Stitch first** — Create the design via the Stitch MCP (`https://stitch.googleapis.com/mcp`) in project `projects/11505180160165595336` (`A inventory UI rev`) using `generate_screen_from_text` or `generate_variants`.
2. **Bind the design system** — Always pass the Ainventory design system generated from [.stitch/DESIGN.md](../../../.stitch/DESIGN.md) (`assets/98bc4c44edea4f0898f4a037ca720090`). Keep `.stitch/DESIGN.md` in sync with real tokens (`src/contracts/carbonDesignContract.ts`, `src/styles/atelierTokens.css`, `src/index.css`, `src/site/styles/tokensAndShell.css`) when tokens change. When passing the bound design system to `generate_screen_from_text`, keep generation prompts strictly structural (layout, sections, interactions, copy) and omit raw hex codes, font names, or radius values; reserve exact hex codes for targeted `edit_screens` calls only. *(See skill: `generate-design`, `manage-design-system`, `enhance-prompt`)*
3. **Non-destructive** — Never overwrite or edit existing Stitch screens or design systems; generate new screens/variants instead (propose 2 variants by default).
4. **Download, audit & report for review** — Download generated HTML and full-resolution screenshots (`screenshot.downloadUrl` with `=w{width}` appended) into `.stitch/designs/` via shell/curl (`fetch-stitch.sh`), visually inspect each `.png` before coding, and persist updated screen IDs and sync timestamps in `.stitch/metadata.json`. Give the user each variant's Screen ID, title, and key layout changes so they can preview at stitch.google.com. *(See skill: `generate-design`, `react-components`, `stitch-loop`)*
5. **User picks, then implement** — Do not change React/CSS source until the user selects a design. Implement on a separate branch, matching the chosen Stitch screen and the Ainventory design contract (monochrome, 8pt grid, `tabular-nums`, 44–48px hit targets).

## Checkpoints & Artifact Hygiene

- Pause and obtain explicit user approval (showing file paths, sizes, and types) before uploading local HTML/images/`DESIGN.md` to Stitch or creating a new Stitch design system.
- If `.stitch/designs/{page}.{html,png}` already exists locally, ask whether to refresh from Stitch MCP or reuse local files before overwriting.
- Confirm the local dev server URL/port before running automated HTML/DOM snapshot capture, and terminate temporary capture servers immediately after extraction. *(See skill: `upload-to-stitch`, `manage-design-system`, `extract-static-html`, `react-components`)*

## Security

- Never print, log, or commit the Stitch API key. Read `STITCH_API_KEY` from gitignored `.env.local` (or private MCP config) in memory and send it only in the `X-Goog-Api-Key` header.
- Never pass large files (>5 KB, including `.stitch/DESIGN.md` and extracted HTML/images) as inline base64 through MCP tool arguments; upload via `.agent/skills/upload-to-stitch/scripts/upload_to_stitch.py` reading `STITCH_API_KEY` from the environment rather than `--api-key` CLI arguments. *(See skill: `upload-to-stitch`, `manage-design-system`, `code-to-design`)*
- Run `npm run verify:secrets` before committing any Stitch-related change.

## Internalized Stitch Skills (`google-labs-code/stitch-skills`)

All 16 official skills from `google-labs-code/stitch-skills` (Apache-2.0 — [.agent/LICENSE-STITCH-SKILLS.md](../../LICENSE-STITCH-SKILLS.md)) are internalized under `.agent/skills/` (`.agents/skills/`). Prefer these local skills at each stage of the Stitch-First workflow:

| Workflow Stage | Local Skill(s) in `.agent/skills/` |
| :--- | :--- |
| **Prompt Polishing** | `enhance-prompt` |
| **Screen & Variant Generation** | `generate-design` |
| **Design System Sync & Authoring** | `manage-design-system`, `design-md`, `extract-design-md`, `taste-design` *(Ainventory `.stitch/DESIGN.md` takes precedence)* |
| **Code → Stitch Migration & Asset Upload** | `code-to-design`, `extract-static-html`, `upload-to-stitch` |
| **Stitch → Code & Multi-Page Build** | `react-components`, `react-vite-dashboard`, `shadcn-ui`, `site-md`, `stitch-loop`, `remotion` *(+ `react-native` retained for upstream parity)* |

Verify internalized Stitch skills and helper scripts at any time with `npm run verify:stitch-skills`.

## Exceptions

If Stitch is unreachable (auth/quota/outage), stop and report to the user; do not silently fall back to ad-hoc UI design. Proceed without Stitch only with explicit user approval.
