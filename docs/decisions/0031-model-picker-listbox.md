# 0031. The model picker is a listbox in two parts, one gesture each

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #333)
- Decider: TJ (git: author and merger of #333)
- Issues and PRs: #232, #333
- Cited in code as: #232
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `src/components/ModelPicker.tsx` bullet

## Context

Choosing a model well means reading eight summaries against each other. The chart's model comparison is chosen in the same control.

## Decision

The model picker is a button that opens a listbox of every model, in the app's one popover shell, portalled to `document.body` and positioned fixed. The popover has two parts with one gesture each. The list selects: tick a row or click it, and nothing on a row ranks or closes the popover. The chip row above it ranks: a tap on a chip's label moves the ranking to that model, and the model it replaces keeps its chip. Chips follow the published editorial order, never the order selected. The last selected model cannot be given up.

## Evidence

The shortest summary needs 303px of label where the control has 245px (the guide's figure, not dated; git: first written in #235, 2026-08-02).

## Alternatives rejected

- A native `<select>`: it shows one summary at a time, and its options cannot carry them.
- A `title` on each option: macOS draws the list as an OS menu that renders no tooltip, and a phone has no hover.
- Absolute positioning: `ControlPanel` is an `overflow-y-auto` column that would clip it.
- One row that both selected and ranked: two gestures a few pixels apart, one of which dismissed the list under the reader's hand.

## Consequences

`utils/modelSelection.ts` holds every rule (which chip ranks next, the order, the last chip, where the keyboard lands) and the node project tests every case. `ModelPicker.test.tsx` shows the gestures reach it. Nothing inside the popover closes it: only Escape and an outside `pointerdown`, which is `usePopover`'s rule.
