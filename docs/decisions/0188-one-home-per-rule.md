# 0188. A rule the code spells in more than one shape has one home, and a check holds every site to it

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #688, 2026-10-17: any rule spelled in more than one shape consolidates, even at two copies. The issue had recommended leaving duplicated edge cases to review.
- Issues and PRs: #688, #690, #388 (`test_single_home.py`), #PRNUM
- Cited in code as: #690
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `numbers.ts` bullet; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `errors.py` bullet; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), Where a source check lives

## Context

Small rules were written several times in different shapes: keeping a number inside a range, telling a cancel from a failure, rounding for display, flooring an instant to its hour. Shapes that agree where someone looked can disagree where nobody did. The audit swept 834 frontend sites and 224 backend sites, grouped them by the rule they implement rather than the token they share, and found shapes that gave different answers.

## Decision

- **One home per rule.** A rule with more than one shape moves to one helper in the module that already owns its subject, or a small new one where none fits. Every site imports the helper. Identical copies count as one shape.
- **Frontend homes:** `utils/numbers.ts` (`clamp`, `isFiniteNumber`, `roundTo`, `grouped`), `utils/abort.ts` (`isAbort`), `utils/points.ts` (`onGlobe`, `coordinateLabel`), `utils/forecastWindow.ts` (the time units, `floorHour`), `utils/calendarDates.ts` (`utcDayKey`), `utils/colors.ts` (`hexToRgb`), `utils/apiFetch.ts` (the `Retry-After` parser, `overlayFeatures`), `utils/unavailableCell.ts` (`NO_VALUE_MARK`, `UNAVAILABLE`), and `utils/basemapPoi.ts`'s `FEET_PER_METER`.
- **Backend homes:** `errors.finite_float`, `errors.retry_after_seconds`, `errors.log_reason`, `cache.point_key`, `limits.floor_hour`, and one spelling for an Open-Meteo column read in `aggregation.py`.
- **A check holds each one.** On the frontend, a `*-one-home` lint in `frontend/tools/eslint/checks/data.js` fails the rule spelled again outside its home (decision record 0043 puts a syntax ban in the linter). On the backend, a case in `backend/tests/test_single_home.py` fails naming the file that grew the copy.
- **Mirrors stay two.** A rule that spans the browser and the pod is two families, one per language. Each side got its own home, and no mirror row lost a half.

## Evidence

The audit ran 2026-10-17 to 2026-10-18 at f971335. Of the frontend's rules, 24 had more than one shape; of the backend's, 14. Where shapes disagreed:

| Rule | The disagreement |
|---|---|
| Clamp | Three private clamps and the inline ones gave two answers to an inverted range |
| Round to N places | `Math.round(x * 10 ** n) / 10 ** n` rounds a negative tie toward zero; `roundTo` rounds the magnitude |
| Is this a cancel | Five sites asked `instanceof DOMException`, which a real abort fails in Vitest's jsdom project (record 0193) |
| A coordinate's cache key | Four backend spellings disagreed at a signed zero |
| An elevation in a cache key | The weather and cloud keys folded 0 ft into "unknown", which give different cloud decks |
| An OSM `ele` | Python's `float` reads `nan` and `inf`, and an unnamed peak's name then failed the discovery with a 502; the browser refuses both |
| A null hourly column | The pod read an explicit JSON `null` as a missing location; the browser read an empty column |
| A `Retry-After` | Two of three backend roundings had no floor, so a shed could answer `Retry-After: 0` |

## Alternatives rejected

- **Leave duplicated edge cases to review** (#688's recommendation). Review had let these grow over about 680 pull requests.
- **Consolidate only at three or more copies.** Two shapes that disagree are the finding, whatever the count.

## Consequences

A new site imports the helper. The lints match a shape, not a meaning: `finite-number-one-home` cannot tell that both halves of a test name one value. A suite that spells a rule on purpose, to hold a helper to the arithmetic it replaced, is exempt from every check but the cancel's and the feet-per-metre factor's. The changed answers are in each row above; `roundTo` moves a share link's half coordinate by under a metre.
