# 0028. Every notice renders in the one block under the Analyze button

- Status: Accepted
- Date: 2026-09-13 (git: the merge of #334), whose review found the scattered lines
- Decider: TJ (git: author and merger of #334)
- Issues and PRs: #123, #334
- Cited in code as: #123
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every notice renders in the one block under the Analyze button"

## Context

`ControlPanel.tsx` had a window warning above the calendar and two lines under it, a screen away from every other message (#123's review).

## Decision

Every notice renders in the one block under the Analyze button, not beside the control it is about. The window lines live in `windowMessages` in `utils/panelMessages.ts`, each a `FooterMessage` keyed on its condition.

## Evidence

The #123 review. No measurement.

## Alternatives rejected

- A notice beside the control it is about: a screen away from every other message.

## Consequences

The linter's `style-footer-notice` and `style-panel-no-status` checks: a notice is a `NOTICE` role, only `FooterNotice` wears one, and `PanelFooter.tsx` renders it once, below the button. The one exception, the polygon draw counter's `STATUS` captions, is pinned by count in `style-draw-counter`.
