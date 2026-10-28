# 0229. The panel's name and tagline start together at the left, upright, and the tagline is "Weather Window Finder"

- Status: Accepted. Supersedes 0226's lockup clauses (the centred name and the italic tagline); its button centring stands. Amends [0222](0222-one-card-one-close-one-type-ramp.md): the one tagline loses its "The".
- Date: 2026-10-27
- Decider: the maintainer (TJ), on #801: "Uncenter Bluebird Forecast, Remove `The` from the subheading, and un-italicize it", then choosing that lockup from all eight combinations of alignment, article and style captured on the PR build in both themes
- Issues and PRs: #801, #802
- Cited in code as: #801, record 0229
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ControlPanel.tsx` bullet; [`docs/STYLES.md`](../STYLES.md), `PANEL_HEADER`

## Context

Record 0226 centred "Bluebird Forecast" over its tagline and set the tagline in italics, in the panel and in the welcome dialog, through a `TAGLINE` role of its own. Seen on the preview, the maintainer asked for both put back, and for the tagline's "The" dropped. The eight lockups were drawn on the PR build at 953c5df, in dark and light, with the header's buttons centred on the logo in every one.

## Decision

- The title block is left-aligned: the name and the tagline start together, as they did before 0226.
- The tagline is upright. The `TAGLINE` role is gone; the panel's tagline wears `TEXT.caption` and the dialog's `PROSE.subtitle`, as before 0226.
- The tagline reads "Weather Window Finder", in the panel and in the welcome dialog.
- The round buttons stay 12px down, centred on the logo (0226).

## Evidence

The eight lockups, captured 2026-10-27 on the PR build in both themes, on the page the maintainer chose from. The two lines are within about 7px of one width, so centring moved almost nothing on screen; what it changed was that the shorter tagline no longer started under the name's first letter.

## Alternatives rejected

- **Main's lockup**: left and upright, with "The". The maintainer dropped the article.
- **The PR's lockup** (0226): centred and italic.
- The five other combinations on the page.

## Consequences

- `styles.test.ts` holds the block left-aligned and the two call sites on their plain roles, and the buttons' centre against the logo's as 0226 left it.
- "The Weather Window Finder" appears nowhere on screen.
