# 0302. The theme follows the device until the reader picks one, from a menu of System, Light and Dark

- Status: Accepted. Supersedes [0158](0158-light-theme-behind-semantic-tokens.md) in part: its dark default and its two-way switch
- Date: 2026-11-16
- Decider: the maintainer (TJ), who asked for it on 2026-10-31 by filing #843, and chose the menu, the strings and no migration on 2026-11-16, and the split sun and moon for System the same day, in a lab of fifteen glyphs
- Issues and PRs: #843
- Cited in code as: #843
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc" and "Every UI change works in both themes"; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `public/theme.js` and `src/testSupport/mediaList.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useTheme.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `viewPrefs.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ThemeMenu.tsx`, `Menu.tsx`, `AppDrawer.tsx`, `BottomSheet.tsx`; [`docs/STYLES.md`](../STYLES.md), Two themes; [`docs/USAGE.md`](../USAGE.md), Theme

## Context

Record 0158 opened the app dark on every device, with a round button in the panel's header that toggled to light and back, and listed following the operating system under Alternatives rejected. So a reader on a light device got a dark page until they found the sun, and a device that turns dark at sunset kept whatever the reader last pressed. A stored dark and no choice at all were the same empty key. The maintainer reversed the default on 2026-10-31 by filing #843.

## Decision

- **The device decides until the reader picks.** Three choices, System, Light and Dark, with System the default, as GitHub and macOS offer them. `bluebird_forecast_theme` holds `light` or `dark` by name, and System removes it.
- **The control is a menu.** The header's round button stays where it was, beside the close button at a desk and beside Done in a phone's Controls sheet, and opens the app's one menu with the three rows in the order System, Light, Dark: a card at a desk and a sheet headed Theme on a phone. The button wears the current choice's glyph, a sun and a moon split by a diagonal for System, a sun for Light and a moon for Dark, and each row leads with its glyph. The System glyph is the other two drawn small in the one ink every glyph wears, so it reads as both themes with the device deciding. Its accessible name is the label and the choice, `Theme System`. The maintainer chose the menu over a button that cycles the three and over a three-way segment in the panel.
- **One attribute stays the truth.** CSS still keys on `data-theme="light"` on the root and nothing else. `useTheme.ts` asks `matchMedia('(prefers-color-scheme: light)')` while the choice is System, writes the attribute, and follows the query's `change` event, so the open app repaints when the device changes, through the same one-frame switch a pick takes (record 0211). `public/theme.js` asks the same query before the first paint when no choice is stored. The linter's `style-no-os-theme` lets the query through in `useTheme.ts` alone.
- **No migration.** A reader who pressed back to dark stored nothing, the same as one who never chose, so both follow the device now. A reader who deliberately picked dark sees light once on a light device and picks Dark again. Readers who chose light keep it.
- **The strings**, approved by the maintainer on 2026-11-16: `Theme` (the button's name and the phone sheet's heading), `System`, `Light`, `Dark`, and the privacy page's "whether you chose the light or dark theme".

## Evidence

- On `main` at 82c0e94 (issue #843, 2026-10-31): `readTheme` returned light only for a stored `light`, `writeTheme` removed the key for dark, and `theme.js` set the attribute only for a stored `light`.
- `public/theme.js` is 386 bytes with the device query added (2026-11-16), under the 400 that `theme.test.ts` holds it to because it blocks the first paint.
- A CSS `@media (prefers-color-scheme: light)` copy of the light token blocks would have spelled every light value twice and needed a third selector for a chosen dark, where the script writes the attribute the stylesheets already read.

## Alternatives rejected

- One button that cycles Dark, Light and System: it hides what the next press does, and going back one step takes two presses.
- A three-way segment in the panel: the panel has no settings section to hold it, and three segments do not fit the header's 32px spot.
- Other glyphs for System: a monitor, which the branch first shipped and the maintainer turned down on sight, a half-filled circle, a half-lit sun, a sunset, an A in a ring, a phone, a laptop, two arrows round a ring, an eclipse, the split with its moon filled, and a disc cut into a light day half and a dark night half, plain or tinted. The discs would have been the first glyphs with fills of their own, a new token pair, or with the tint a new hue role.
- Writing an explicit dark for every browser with no key on its first load after the release, so returning readers stayed dark: those readers would never learn the app could follow their device.
- The theme in the share link: rejected by 0158 and still rejected, since a link carries a session and not a browser's habit.
