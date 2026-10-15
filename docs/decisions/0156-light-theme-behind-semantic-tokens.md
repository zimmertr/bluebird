# 0156. The app has a light theme behind a header switch, painted through semantic tokens, and opens dark

- Status: Accepted
- Date: 2026-10-15
- Decider: the maintainer (TJ), on issue #706, 2026-10-15
- Issues and PRs: #706
- Cited in code as: #706
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc"; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `index.css` and `public/theme.js`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useTheme.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `viewPrefs.ts`, `colors.ts`, `chartColors.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ThemeButton.tsx`, `BottomSheet.tsx`; [`docs/STYLES.md`](../STYLES.md), Two themes and The light theme; [`docs/USAGE.md`](../USAGE.md), Light theme

## Context

The app was dark everywhere, and every colour role in `styles.ts` named a slate or sky step directly, so a second theme could only be every role spelled twice. Issue #706 asked for a light theme a reader could choose. The maintainer settled the palette (the Material light preset from the theme lab, 2026-10-13), the switch, where the choice is kept, and how the ranked cells and the chart lines read on a light page, in mockups on the issue before any code.

## Decision

- **Every colour role paints a semantic token, never a palette step.** `index.css` registers about forty tokens (`page`, `panel`, `raised`, `recessed`, `rule`, `frame`, `edge`, six inks, the accent family, the status inks and the notice tints and lines) in an `@theme inline` block as `--color-<token>: var(--ui-<token>)`. `:root` sets each `--ui-*` to the Tailwind step the dark theme always painted, and `:root[data-theme="light"]` to the light palette. `styles.ts` composes the token utilities, so each role is spelled once.
- **Dark is the default, whatever the operating system says.** Light applies only under `data-theme="light"`.
- **The switch is a round icon button in the panel's header**, beside the close button at a desk and beside Done in a phone's Controls sheet title row, and nowhere else. Its glyph is the theme a press goes to (a sun while dark, a moon while light), its accessible name is `Switch to light theme` or `Switch to dark theme`, and it has no visible label, tooltip or `title`.
- **The choice is kept in the browser, not the link.** `bluebird_forecast_theme` in localStorage, read by `viewPrefs.ts`, with nothing stored for dark. A share link carries a session rather than a browser's habit.
- **A stored light theme is on the root before the first paint**, set by `public/theme.js`, a classic same-origin script in the head of all four HTML entries, because the CSP refuses an inline one.
- **In light a ranked cell keeps the band's tint at 20% and prints its number in the same hue's Tailwind 800 step**, interpolated between bands like the tint. Dark keeps its recipe exactly.
- **The chart has a light twin of its ten-line palette**, the same hues one or two steps down, and the generator past the tenth line walks at lightness 40 where dark walks at 60.
- **The map, its markers and overlays, and the popups do not change.** The map is terrain and light in both themes, and the popups are MapLibre's white cards.

## Evidence

Measured 2026-10-15 in `styles.test.ts` against the values it parses out of `index.css`: white on the light accent fill `#00639b` 6.45:1, the fill 5.74:1 on the panel, 5.00:1 on the range band and 6.45:1 on the segment track, the darkening hover 7.96:1; the lowest text role on any surface 7.47:1; the faint ink 3.87 to 4.85:1 where an icon stands; the structural edge 3.97 and 4.46:1; every notice ink 6.93:1 or better on its tint and the panel; `MUTED` at 65% 5.07 to 5.34:1, where 60% left 4.31 to 4.50. The theme lab measured the same fill at 6.44, 5.74, 5.00 and 6.44 on 2026-10-13. The dark tokens are read back to the slate and sky steps they always were, so every dark ratio pinned before stands unchanged.

Ranked-cell inks on the light panel over their tint, `colors.test.ts`: the verdict ramp 5.42 to 6.27:1, temperature 5.44 to 7.26:1, the freezing level 5.83 to 8.06:1. The 700 steps measured 3.8 to 5.0:1 in the lab. Chart lines on the light panel, `chartColors.test.ts`: the lowest is orange-600 at 3.21:1, and the axis 8.34:1.

Cost, measured 2026-10-15 in a probe against the built image with every third-party host answered from fixtures: an overlay toggle at 946 destinations took 2 ms before and 3 ms after, so the three memoized components still skip it. The switch itself re-renders every row and line, because each cell's ink and each line's colour change: 639 ms at 946 displayed rows and 165 ms at the default 200.

## Alternatives rejected

- **Following the operating system's setting.** The maintainer chose dark for everyone until a reader asks otherwise.
- **The theme in the URL.** A link would hand its sender's habit to whoever opens it.
- **An inline script in the head.** The CSP's `script-src 'self'` refuses it, and loosening the policy for one line was not worth it.
- **A plain `@theme` block pointing at the variables.** It resolves once, on the root, so an override under `data-theme` would never reach the utilities.
- **The band's 700 step as the light cell ink.** It fails AA on the tint (3.8 to 5.0:1).
- The other switch placements and cell treatments mocked on the issue, which the maintainer passed over for these.

## Consequences

The linter fails a slate, white or black utility at any call site, because it paints the dark value in both themes, and the hue ban reaches the hue tokens. `styles.test.ts` pins every light ratio as a literal beside the dark ones and fails a token the light block does not declare; `theme.test.ts` holds the script's key to `THEME_KEY`, its size and its place in the four entries; the browser suite runs axe on its three states in each theme. A new colour role needs a token with a value in both blocks, and a measurement in each. The privacy page lists the stored choice among what the app saves in the browser.
