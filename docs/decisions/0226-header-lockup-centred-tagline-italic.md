# 0226. The panel's name centres over an italic tagline, and its round buttons centre on the logo

- Status: Accepted. Amends [0222](0222-one-card-one-close-one-type-ramp.md): the tagline keeps its words and is set in italics.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on #801, asking whether the header's buttons were centred, whether the name should centre over the tagline, and whether the tagline should be italic like a slogan, then taking all three
- Issues and PRs: #801
- Cited in code as: #801
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ControlPanel.tsx` and `WelcomeModal.tsx` bullets; [`docs/STYLES.md`](../STYLES.md), `PANEL_HEADER` and `TAGLINE`

## Context

The panel's header is 56px: the logo and the title block both centre at 28px. The theme switch and the close button stood 8px from the top, so their 32px circles centred at 24px, 4px high. The name and the tagline were left-aligned in their block, and the tagline was upright in the caption grey.

## Decision

- The round buttons stand 12px down (`PANEL_HEADER.actions`), so their centres sit at 28px with the logo's.
- The title block centres its two lines (`PANEL_HEADER.title`).
- The tagline is italic in the panel and in the welcome dialog (`TAGLINE.panel` and `TAGLINE.dialog`). A role of its own, because the two roles it wore set other lines too, a page's subtitle among them.

## Evidence

Measured 2026-10-22 on a local build of main (0f121ea) at 1440x900: the logo centred at 28px, the title block at 28px, both buttons at 24px. The name and the tagline are within about 7px of one width, so centring moves the name about 3px.

## Alternatives rejected

- **Left-aligned and upright**, as it was, which Claude recommended: left-aligned text beside a left-hand logo is the usual app header, and italic grey is the panel's hint style (`TEXT.helper`). The maintainer preferred the slogan's look.
- **Centring the welcome dialog's lines too**: its title is much longer than its tagline, so centring would change that header far more than this one. It keeps its alignment and takes the italic.

## Consequences

`styles.test.ts` holds the buttons' centre against the logo's, the centred block and the italic on the tagline's role alone.
