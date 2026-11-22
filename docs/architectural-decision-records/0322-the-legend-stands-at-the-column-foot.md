# 0322. The legend stands at the foot of the desk's results column

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amended by [0332](0332-the-review-answers-of-2026-11-21.md) (the maintainer's review answers). On a phone amended by [0333](0333-a-phone-matches-the-desk-after-a-forecast.md).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, moving the legend to the results column's foot; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0322
- Guide: `frontend/src/components/CLAUDE.md` (`MapStage.tsx`, `MapLegend.tsx`, `ResultsSheet.tsx`), `frontend/src/styles.ts` (`RESULTS_COLUMN.foot`)

## Context

At a desk the legend was a card under a **Legend** chip at the map's top left (record 0174), over the map a reader draws on. The prototype prints its score scale at the foot of the results column, under the rows it colours, and the maintainer moved the legend there.

## Decision

- **The column's foot.** While the desk's results column stands, the map's legend draws into a foot under the table (`RESULTS_COLUMN.foot`), ruled off the rows and scrolling past a fifth of the column. It is the same key the card held, every section in the Layers menu's order (`LegendSections`): the score's or the metric's scale first, then each layer that is on.
- **The chip while there is no column.** Before a report, and while the column is folded away, there is no foot, so the **Legend** chip and its card stand on the map as before, and a layer's key is never without a home.
- **Through a portal.** `MapStage` builds the sections, as it did, and draws them into the foot `ResultsSheet` renders (`legendFootRef`, held in `App.tsx` as `legendHost`), so neither builds the other's half.
- **A phone keeps its chip and sheet** (record 0136).

## Evidence

- `MapStage.test.tsx` pins the key drawn into the foot with no chip at a desk, and the chip on a phone.

## Open

- The prototype's foot is one line, `Fog 66` and a ramp and `87 Bluebird`. This draws the score's existing key, the ramp with its ticks under the label `Score`; the two end words need the maintainer's word as strings.
