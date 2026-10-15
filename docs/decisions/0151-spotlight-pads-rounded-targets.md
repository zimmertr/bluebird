# 0151. The tutorial's light pads a rounded target by 8px and follows its corners

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14
- Issues and PRs: #696, #708, #536
- Cited in code as: #696
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet; `docs/STYLES.md`, the elevation scale

## Context

The spotlight was square around a section or a box and 6px larger with the surface radius (8px) around a control. The phone's Analyze step lit the floating button with no pad at all, square, so its 16px corners and its shadow stood on the light's rim.

## Decision

- **Every rounded target takes 8px of light** (`SPOTLIGHT_PAD`): a control step as before, and any target rounded on all four corners, which is how the phone's Analyze button and the Layers chip are told from a section between two rules or a sheet rounded only on top, which stay unpadded and square.
- **The light's corner is the target's own radius plus the pad** (`spotRadius`), read off the target's computed corners at each measure (`cornerRadius`, the smallest of them, across every element a step frames), so the gap between the control's edge and the light's is 8px all the way round. The Analyze button's 16px (`rounded-2xl`) gives 24px. It is not a role: the light follows whatever it frames, and `TOUR.spotlightControl` is gone.

## Evidence

`tour/place.test.ts` holds the Analyze button's 16px corners giving an 8px pad and a 24px light, a pill chip padded the same way, a section, a square box and a top-rounded sheet left square and unpadded, and the smallest corner taken across framed elements. `Tour.test.ts` holds the overlay drawing its corners from those functions.

## Consequences

The marker step's keep-out below the card grows by the 2px the pad gained (`sheetKeepOut`).
