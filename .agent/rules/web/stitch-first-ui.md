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
2. **Bind the design system** — Always pass the Ainventory design system generated from [.stitch/DESIGN.md](../../../.stitch/DESIGN.md) (`assets/98bc4c44edea4f0898f4a037ca720090`). Keep `.stitch/DESIGN.md` in sync with real tokens (`src/contracts/carbonDesignContract.ts`, `src/styles/atelierTokens.css`, `src/index.css`) when tokens change.
3. **Non-destructive** — Never overwrite or edit existing Stitch screens or design systems; generate new screens/variants instead (propose 2 variants by default).
4. **Report for review** — Give the user each variant's Screen ID, title, and key layout changes so they can preview at stitch.google.com.
5. **User picks, then implement** — Do not change React/CSS source until the user selects a design. Implement on a separate branch, matching the chosen Stitch screen and the Ainventory design contract (monochrome, 8pt grid, `tabular-nums`, 44–48px hit targets).

## Security

- Never print, log, or commit the Stitch API key. Read `STITCH_API_KEY` from gitignored `.env.local` (or private MCP config) in memory and send it only in the `X-Goog-Api-Key` header.
- Run `npm run verify:secrets` before committing any Stitch-related change.

## Exceptions

If Stitch is unreachable (auth/quota/outage), stop and report to the user; do not silently fall back to ad-hoc UI design. Proceed without Stitch only with explicit user approval.
