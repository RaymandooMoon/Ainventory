---
trigger: glob
globs: "**/*.css,**/*.scss,**/*.sass,**/*.less,**/*.html,**/*.tsx,**/*.jsx,**/*.vue,**/*.svelte"
---
> This file extends [common/patterns.md](../common/patterns.md) with web-specific design-quality guidance.

# Web Design Quality Standards

## Anti-Template Policy

Do not ship generic template-looking UI. Frontend output should look intentional, opinionated, and specific to the product.

### Banned Patterns

- Default card grids with uniform spacing and no hierarchy
- Stock hero section with centered headline, gradient blob, and generic CTA
- Unmodified library defaults passed off as finished design
- Flat layouts with no layering, depth, or motion
- Uniform radius, spacing, and shadows across every component
- Safe gray-on-white styling with one decorative accent color
- Dashboard-by-numbers layouts with sidebar + cards + charts and no point of view
- Default font stacks used without a deliberate reason
- Unresolved Stitch placeholder anchors (`href="#"`) left in shipped navigation or header logos
- Fabricated metrics, uptime SLAs, response times, unobserved design tokens, or filler UI copy (`"Scroll to explore"`, bouncing scroll chevrons, generic AI marketing clichés) *(See skill: `react-components`, `stitch-loop`, `taste-design`, `extract-design-md`)*

### Required Qualities

Every meaningful frontend surface should demonstrate at least four of these:

1. Clear hierarchy through scale contrast
2. Intentional rhythm in spacing, not uniform padding everywhere
3. Depth or layering through overlap, shadows, surfaces, or motion
4. Typography with character and a real pairing strategy
5. Color used semantically, not just decoratively
6. Hover, focus, and active states that feel designed
7. Grid-breaking editorial or bento composition where appropriate
8. Texture, grain, or atmosphere when it fits the visual direction
9. Motion that clarifies flow instead of distracting from it
10. Data visualization treated as part of the design system, not an afterthought

## Before Writing Frontend Code

1. Check for an existing project design system (`DESIGN.md`, theme/token contracts, CSS custom properties, component primitives, and icon libraries) and reuse it before introducing any new palette, font stack, or UI dependency.
2. Only when starting a greenfield surface without an established system, choose a specific style direction (avoiding vague defaults), define an intentional palette, and select typography deliberately.
3. Record the surface's primary action, visual hierarchy, target viewports, and applicable content states; gather real references when establishing a new direction.
4. Use ECC design/frontend skills (`frontend-design-direction`, `design-system`, `extract-design-md`) where relevant.

## Worthwhile Style Directions

- Editorial / magazine
- Neo-brutalism
- Glassmorphism with real depth
- Dark luxury or light luxury with disciplined contrast
- Bento layouts
- Scrollytelling
- 3D integration
- Swiss / International
- Retro-futurism

Do not default to dark mode automatically. Choose the visual direction the product actually wants.

## Typography & Layout Stability

- Apply `font-variant-numeric: tabular-nums` (or monospace in dense data tables) to updating counters, prices, timers, timestamps, and aligned numeric columns.
- Use `text-wrap: balance` on headings/titles and `text-wrap: pretty` on short body copy; omit both on long prose or `<pre>`/`<code>` blocks.
- Scale display typography fluidly with `clamp()` and verify zero horizontal overflow across mobile and desktop breakpoints.
- See skill: `make-interfaces-feel-better`, `taste-design`, `frontend-design-direction`.

## Component Checklist

- [ ] Does it avoid looking like a default Tailwind or shadcn template?
- [ ] Does it have intentional hover/focus/active states?
- [ ] Does it use hierarchy rather than uniform emphasis?
- [ ] Would this look believable in a real product screenshot?
- [ ] If it supports both themes, do both light and dark feel intentional?
- [ ] Are all navigation anchors and header logos wired to real routes/handlers (zero `href="#"`) and all displayed numbers backed by real data?
