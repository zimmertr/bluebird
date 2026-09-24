# 0028. Every notice renders in the one block under the Analyze button

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 64

- **Every notice renders in the one block under the Analyze button.** Not beside the control it is about: `ControlPanel.tsx` had a window warning above the calendar and two lines under it, a screen away from every other message, which is what #123's review found. `windowMessages` in `utils/panelMessages.ts` is where those now live (the archive-model line, the model's clamp, the window warning, the archive seam line, the air-quality horizon line), each a `FooterMessage` keyed on its CONDITION like every other derived line. The linter's `style-footer-notice` and `style-panel-no-status` checks enforce it through the box: a notice IS a `NOTICE` role, only `FooterNotice` wears one, and `FooterNotice` is rendered exactly once, below the button, by `PanelFooter.tsx`. The one exception is pinned by count in `style-draw-counter` — the polygon's draw counter colours its captions by `STATUS`, which is a field's own readout beside the field rather than a message about the analysis.
