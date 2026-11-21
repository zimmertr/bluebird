# 0319. The results header carries the lenses and the limits

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, keeping the prototype's results header; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0319
- Guide: `frontend/src/components/CLAUDE.md` (`ResultsBar.tsx`, `LensChips.tsx`, `LimitChips.tsx`), `frontend/src/utils/CLAUDE.md` (`limitChips.ts`), `frontend/src/utils/score/CLAUDE.md` (`headline.ts`), `frontend/src/styles.ts` (`RESULTS_HEAD`)

## Context

The forecast bounds lived in the Metrics table behind the sentence bar's **Limits** chip, so a reader saw a shorter table and nothing on screen said why. The prototype keeps everything a reader can change without spending on the results' own header: a headline that counts the field ("12 of 40 score 80 or more"), a line under it with when the best hours fall, the window and the model, the lenses as pills, and every bound as a chip in words with its ×, a dashed pill to add one, and how many rows the bounds hide.

## Decision

- **The headline counts the field.** `headlineText` reads `{n} of {N} score {bar} or more`, N being every row with a score.
- **One subtitle line.** `bestHoursText` names the day most of the top twenty rows' best four hours fall on and that day's middle start, as `Best hours mostly Sat, 1p–5p`; the window and the model follow it, joined with ` · `. The best hours show only while a lens ranks.
- **Lenses are pills.** `LensChips` draws each lens as a pill, idle ruled in the lifted caption's ink (the soft ink reads 3.93:1 on the bar's raised fill) and lit in the accent fill, both in one box so a press moves nothing (`RESULTS_HEAD`).
- **Limits are chips.** `LimitChips` draws a chip per bound (`limitChips`: `{Metric} under {value}` for a ceiling, `{Metric} above {value}` for a floor, `Nothing falling` for a precipitation ceiling of 0), each with a × that clears that bound alone, then the **Limit** pill, then `{n} hidden by limits`. The pill opens the Limits card at a desk and the Controls sheet on a phone.
- **Limits leaves the sentence.** The sentence bar no longer carries a **Limits** chip: it says what a Forecast searches and over which hours, and the bounds are no part of that, since they re-read held rows and never spend (record 0003).

## Evidence

- `headline.test.ts` pins the headline and the best-hours line, `limitChips.test.ts` the chip words and units, `LimitChips.test.tsx` the × and the pill, `ResultsBar.test.tsx` the subtitle and the row showing only with results, and `styles.test.ts` that a lit lens stands in the idle one's box.

## Open

- The Metrics table, ranking choice and aggregates included, is reached at a desk only once a report stands, from the **Limit** pill. Before a report there is nothing for them to re-present.
- The prototype tints a lit lens; this draws it in the accent fill every pressed control here wears (record 0251).
- The prototype's chip carries a colour swatch in its sketch, which its markup never renders; this draws none.
