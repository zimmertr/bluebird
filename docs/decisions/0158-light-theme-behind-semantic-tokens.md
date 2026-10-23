# 0158. The app has a light theme behind a header switch, painted through semantic tokens, and opens dark

- Status: Accepted. Its popup clause is superseded by 0163: the popups follow the theme. Amended by 0211: a switch re-renders neither the table nor the chart. Its chart-line clause is superseded by 0228: the lines are Tableau 10 in both themes, with no rim.
- Date: 2026-10-15
- Decider: the maintainer (TJ), on issue #706, 2026-10-15; the accent and the chart lines on PR #733, 2026-10-15
- Issues and PRs: #706, #733
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
- **The light accent fill and checkbox mark are the dark theme's own sky-650** (PR #733), so the accent is one colour in both themes. Its hover darkens to `#00639b`, which with a white label is the direction that gains contrast. The accent as text (links, `ACCENT.text`, the focus ring) stays `#00639b`, because sky-650 reads under 4.5:1 on the light panel.
- **The light warning ink is amber-800, `#973c00`** (PR #733), where the palette had `#6b4600`, a dark brown that no longer read as a warning beside dark's amber-300. It is still amber, redder, and 28° of hue from the danger red, so a warning and an error stay apart. It is what the forecast grid's waiting and loading lines, the model comparison's notes, the large-polygon caption, the search notice and the warning boxes wear.
- **In light a ranked cell keeps the band's tint at 20% and prints its number in the same hue's Tailwind 800 step**, interpolated between bands like the tint. Dark keeps its recipe exactly.
- **The light chart lines are pastels over a thin dark edge** (PR #733): the ten curated hues at Tailwind's 300 step and the golden-angle generator past them at HSL saturation 70, lightness 78, each line drawn over a rim of the light `ink-soft`, 1px each side, which carries the 3:1 the pastel cannot on the light panel. Every mark in a line's colour wears the same rim: the hover dot, a point sample's dots, the readout's swatches, the chart-only legend's dots and a ticked chart checkbox. Dark keeps its 400-step palette and no rim, and its generator walks at lightness 64, the lowest whole value at which every hue clears 3:1 on its panel.
- **Every UI change after this one works in both themes** (the maintainer, 2026-10-15 on PR #733). What can be measured is enforced: the linter fails a palette step, a hue or a colour value at a call site, `style-no-os-theme` fails a `dark:` variant or a `prefers-color-scheme` query so the theme stays the switch's, `styles.test.ts` fails a token without a light value, and the browser suite runs axe in each theme. What cannot be measured is how a colour reads beside its neighbours, which is how the warning ink above passed every ratio as the wrong colour, so a UI change is screenshotted in both themes for review.
- **The map, its markers and overlays, and the popups do not change.** The map is terrain and light in both themes, and the popups are MapLibre's white cards.

## Evidence

Measured 2026-10-15 in `styles.test.ts` against the values it parses out of `index.css`: white on the light accent fill, sky-650 (`#007bc1` as the browser paints it), 4.56:1, the fill 4.06:1 on the panel, 3.64:1 on the raised surface, 4.56:1 on the segment track and the well, 3.54:1 on the range band and 3.17:1 on its hover, the darkening hover `#00639b` 6.45:1; the resting dark ink on the fill 3.75:1, which is why a lit chip's label takes the label-on-fill ink. The theme first shipped `#00639b` as the fill (white 6.45:1, 5.74:1 on the panel), which the maintainer found too dark on Analyze, the segments, the calendar's ends and the checkboxes on PR #733. The lowest text role on any surface 7.47:1; the faint ink 3.87 to 4.85:1 where an icon stands; the structural edge 3.97 and 4.46:1; every notice ink 5.85:1 or better on its tint and the panel (the warning's amber-800 the lowest, 5.66:1 on the raised surface); `MUTED` at 65% 5.07 to 5.34:1, where 60% left 4.31 to 4.50. The dark tokens are read back to the slate and sky steps they always were, so every dark ratio pinned before stands unchanged.

Ranked-cell inks on the light panel over their tint, `colors.test.ts`: the verdict ramp 5.42 to 6.27:1, temperature 5.44 to 7.26:1, the freezing level 5.83 to 8.06:1. The 700 steps measured 3.8 to 5.0:1 in the lab. Chart lines, `chartColors.test.ts`, 2026-10-15: the light 300-step pastels read only 1.16 to 1.62:1 on the light panel, and 5.14 to 7.21:1 against their rim, which reads 8.34:1 on the panel; the light generator at S70 L78 reads 3.90 (pure blue) to 7.75:1 against the rim over the first thousand allocator indices; the dark generator at S70 L64 reads 3.08 to 10.74:1 on slate-800, where at L60 it bottomed out at 2.53. A higher light saturation fails sooner (S80 bottoms at 3.70, S90 at about 3.5). A ticked light chart box, read off a screenshot of the built image: its rim is the `ink-soft` `#42474e` and its fill exactly the line's colour (lime-300 `#bbf451` measured `#bbf451`).

Cost, measured 2026-10-15 in a probe against the built image with every third-party host answered from fixtures: an overlay toggle at 946 destinations took 2 ms before and 3 ms after, so the three memoized components still skip it. The switch itself re-renders every row and line, because each cell's ink and each line's colour change: 639 ms at 946 displayed rows and 165 ms at the default 200.

How the line rim is drawn was chosen by measurement (PR #733), in a probe against three built images in headless Chromium with a three-day window, one run each (a theme switch the median of three each way, a hover the median of 15 moves; script is dispatch to two task yields, frame is dispatch to the task after the next frame; raster is the summed `RasterTask` time per move from a trace):

| | No rim (before) | A second line under each | One SVG filter |
|---|---|---|---|
| Switch to light, 946 lines, script / frame | 1,198 / 1,221 ms | 2,344 / 2,393 ms | 1,112 / 1,134 ms |
| Switch to light, 200 lines | 237 / 313 ms | 331 / 344 ms | 245 / 305 ms |
| Hover in light, 946 lines, frame / raster | 53 / 24.3 ms | 68 / 47.5 ms | 52 / 22.3 ms |
| Hover in light, 200 lines, frame / raster | 35 / 25.5 ms | 46 / 48.4 ms | 32 / 26.3 ms |

The second line doubles what Recharts lays out and what the rasterizer fills; the filter costs about what no rim did. A rerun of the filter build read 1,363 and 322 ms for the two switches, so single runs carry that much noise. The memo rule holds on the filter build exactly as on the base: opening the Layers popover commits twice and re-renders none of `TimeSeriesChart`, `ResultsTable` and `MapView` (read from each memoized body's props object through the DevTools hook), an overlay toggle re-renders only `MapView`, whose props carry the overlay, and a theme switch re-renders the chart and the table and not the map.

## Alternatives rejected

- **Following the operating system's setting.** The maintainer chose dark for everyone until a reader asks otherwise.
- **The theme in the URL.** A link would hand its sender's habit to whoever opens it.
- **An inline script in the head.** The CSP's `script-src 'self'` refuses it, and loosening the policy for one line was not worth it.
- **A plain `@theme` block pointing at the variables.** It resolves once, on the root, so an override under `data-theme` would never reach the utilities.
- **The band's 700 step as the light cell ink.** It fails AA on the tint (3.8 to 5.0:1).
- **`#00639b` as the light accent fill**, the Material primary the theme first shipped. It cleared every constraint with room, and the maintainer found it too dark on the controls it fills (PR #733). It stays as the light accent's text and hover.
- **The 600 and 700 steps as the light chart lines**, which stood 3:1 on the panel alone. The maintainer found them too dark (PR #733).
- **A second, wider line under each light line for its rim.** It draws a rim between two crossing lines where the filter draws one outline round both, and it measured about twice the filter's cost on a theme switch and a hover (above).
- **A higher saturation for the light generator.** S80 and S90 fail sooner at the same lightness.
- The other switch placements and cell treatments mocked on the issue, and the other accent and line treatments mocked on PR #733, which the maintainer passed over for these.

## Consequences

The linter fails a slate, white or black utility at any call site, because it paints the dark value in both themes, and the hue ban reaches the hue tokens. `styles.test.ts` pins every light ratio as a literal beside the dark ones and fails a token the light block does not declare; `theme.test.ts` holds the script's key to `THEME_KEY`, its size and its place in the four entries; the browser suite runs axe on its three states in each theme. A new colour role needs a token with a value in both blocks, and a measurement in each. `chartColors.test.ts` holds every curated line and the first thousand generated ones to 3:1 against their boundary in each theme, `styles.test.ts` holds the stylesheet's rim rule to the chart's layer and filter, and `chartRim.spec.ts` holds in a browser that the rule reaches the group Recharts draws the lines into, since a Recharts release that renamed that group would leave the light lines under 2:1 with every unit test green. A new mark in a line's colour needs the rim in light. The privacy page lists the stored choice among what the app saves in the browser.
