# 0005. The README is an index and the prose lives in docs/

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, lines 11 to 15

Prose lives in `docs/`. The README is an index, not a manual: it carries the
Summary, How It Works, Quick Start, the docs table, Support, and License, and
nothing else. Anything longer than a paragraph belongs on a page below, with
the README linking to it. It was split out of a 560-line README in #192
(issue #113); do not let it grow back.

## From `CLAUDE.md`, line 37

- **Never restate a numeric limit that `GET /api/capabilities` publishes.** Describe the shape and the reasoning, and point at the endpoint for the value. Prose copies drift: the split found three that already had (polygon cap, max results, CAMS grid). This is the whole point of issue #113.
