# 0029. An archive window disables the model picker instead of hiding it

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 54

It takes a `disabled` prop for the one window the model does not apply to (an archive window, #123 — a window that CROSSES the boundary keeps the picker, because its forecast half is the chosen model's), wearing `DISABLED` rather than disappearing: a control that vanishes takes its label and its last value with it, and an info line under Analyze says why it is faded (it was a `title` on the trigger until 2026-09-14, out of reach of every touch reader).
