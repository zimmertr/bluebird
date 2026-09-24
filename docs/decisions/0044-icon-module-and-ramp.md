# 0044. Every glyph comes from one icon module on a four-step ramp

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #417)
- Decider: TJ (git: author and merger of #417)
- Issues and PRs: #386, #417, #435, #436
- Cited in code as: #386, #435, #436
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/components/icons.tsx` bullet

## Context

The app had nineteen hand-drawn SVGs. The close cross existed six times at three sizes and two stroke weights, two of the six were announced where the other four were not, and the select arrow's path was typed out three times.

## Decision

Every glyph is one component in `components/icons.tsx`. The module owns the paths, the stroke weight, the viewBox, the step from the `ICON` ramp, and `aria-hidden`; the call site owns only placement and colour. The `ICON` ramp is four steps, and each one states the number that chose it. `src/iconPaths.ts` holds the one shape the popup's HTML string also draws (#435).

## Evidence

The search magnifier folded into `control`: a 15px box centres on a half pixel in a 36 or 44px row whose other two glyphs sit at 16. The two chips' remove crosses folded into one `chip` step at 12: both chips measure exactly 24px tall, and the 24-unit viewBox halves onto whole pixels at 12 and not at 10.

## Alternatives rejected

- An SVG drawn at each call site: six crosses in three sizes.
- A 15px magnifier: a half-pixel centre.
- A 10px chip cross: no whole-pixel halving.

## Consequences

The linter's `style-own-glyphs` check fails an `<svg` anywhere else under `components/` or in `App.tsx`, and a height or width handed to an icon. `style-popup-glyph` fails a literal SVG tag in `popupChrome.ts`.
