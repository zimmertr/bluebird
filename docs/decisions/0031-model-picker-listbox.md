# 0031. The model picker is a listbox in two parts, one gesture each

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 54

- `src/components/ModelPicker.tsx` — the forecast model as a button opening a listbox of all of them, in the app's one popover shell and placed by the app's one popover hook (see the bullet below), so it is portalled to `document.body` and positioned fixed like every other panel. A native `<select>` cannot do this job: choosing well means reading eight summaries against each other, a select shows one at a time, and its options cannot carry them (the shortest needs 303px of label where the control has 245px). `title` on an option is no way out either — macOS draws the list as an OS menu that renders no tooltip, and a phone has no hover. Fixed rather than absolute because `ControlPanel` is an `overflow-y-auto` column that would clip a child at the scroll boundary.

## From `frontend/src/CLAUDE.md`, line 54

It is also where the chart's model comparison is chosen (#232), and the popover is **two parts with one gesture each**. **The LIST selects**: tick a row's box or click anywhere on the row, untick to remove, and nothing on a row ranks or closes the popover. **The CHIP ROW above it ranks**, under a `Selected models` header drawn in the list header's own recipe so the popover's two blocks read as two parts of one control: one chip per selected model in the published editorial order (never the order selected), the ranking model's chip highlighted with `CHIP.active`, and a tap on any other chip's label moves the highlight to it — the `model-changed` data knob, window clamp included, with the model it replaces keeping its chip. The split is the design: one row that both selected and ranked put two gestures a few pixels apart, one of which dismissed the list under the reader's hand.
