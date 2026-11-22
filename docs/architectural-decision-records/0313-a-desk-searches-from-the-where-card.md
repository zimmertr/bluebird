# 0313. A desk searches for places from the Where card

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amended by 0328 (a phone's search heads the Controls sheet too).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, choosing "Inside the Where card" for the place search
- Issues and PRs: #825
- Cited in code as: record 0313
- Guide: `frontend/src/components/CLAUDE.md` (`MapRows.tsx`, `AppDrawer.tsx`, `MapStage.tsx`, `SentenceBar.tsx`), `frontend/src/hooks/CLAUDE.md` (`useSlashToSearch.ts`)

## Context

The prototype's top left holds one thing, the sentence bar. The build kept today's search pill beside it, and once the results took a column (record 0312) the map was narrow enough that the pill squeezed the Where and When chips to empty boxes (the maintainer's screenshot, 2026-11-21).

## Decision

At a desk the place search moves to the head of the Where card, above the card's sections, and `/` opens the card with the keyboard in the field (`useSlashToSearch`). The map's row carries the sentence bar alone. A phone keeps its pill until the phone's shell.

The Where and When chips cut their words before anything else in the bar gives way, and never below about five letters (`SENTENCE_BAR.slot`). On a map narrower than 52rem the product's name gives its width to the sentence, staying behind for a screen reader as the page's heading.

## Evidence

- `MapRows.test.tsx` pins that a desk's row carries no pill beside the bar while a phone's keeps it. `AppDrawer.test.tsx` pins that the search heads the Where card and no other. `useSlashToSearch.test.tsx` pins the key, the focus once the field mounts, and that `/` typed in a field or with a modifier is left alone.

## Open

- The search inside the card still wears the map pill's look; the card's own field style comes with the bar's restyle.
