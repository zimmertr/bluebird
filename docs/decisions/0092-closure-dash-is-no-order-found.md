# 0092. The Closure dash means "no Forest Service order found", and the N/A hover names only the states the live outline holds

- Status: Proposed
- Date: 2026-10-01
- Decider: pending the maintainer. The coordinating session scoped #567 to the issue's recommendation (option A, with the N/A hover fixed in the same change; land ownership geometry left for a separate issue)
- Issues and PRs: #567
- Cited in code as: `utils/closureProximity.ts` (`CLOSURE_STATE_PROBES`, `coveredStates`, `closureUncoveredNote`), `hooks/useClosureProximity.ts`, `backend/app/services/usfs_coverage.py` (`STATE_PROBES`)
- Guide: root `CLAUDE.md`, mirror row 34; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `closureProximity.ts` bullet

## Context

The Closure column shows a dash for every row inside the area coverage outline that no order polygon holds. The outline is drawn around states, and the feeds carry Forest Service orders alone, with Region 6 publishing fire closures only. The Round 5 readiness review cast eight points against the live outline on 2026-10-01 and found every one inside it with no hit: Mount Rainier, Eldorado Peak, Mount Olympus, the Crater Lake rim, Grand Teton and Angels Landing (park land), Mount Si (Washington DNR) and Slesse Mountain (British Columbia, inside the 0.2° outward bias). `docs/USAGE.md` called such a row open.

The N/A hover was one fixed sentence naming eight states. The outline is composed per snapshot from the regions whose feeds answered, so when a Region 3 or Region 4 feed failed, its rows read N/A under a sentence that still named its states as covered.

## Decision

The docs say what the dash means, "no Forest Service order found", and name the ground inside the outline it cannot speak for: national parks, state land, BLM and tribal land, the Canadian strip, and non-fire closures in Oregon and Washington. No page calls a cleared row open.

The N/A hover is composed from the same `coverage` member that marks the row uncovered. The browser holds one point per state, asks the live outline which it holds, and lists those states. The points are the backend's (`STATE_PROBES`, beside the rings), its tests hold each inside its own region's rings and outside every other's, and `mirrored_constants.json` holds the browser's copy to them. With every feed answering, the sentence is the approved one byte for byte.

## Evidence

`test_each_state_probe_sits_in_its_own_region_alone` in `test_usfs_closures.py`; `closureProximity.test.ts` pins the full outline to the approved sentence and a Region 3 failure to a list without Arizona and New Mexico; `useClosureProximity.test.tsx` pins the hook reading the note off the response it marked rows with.

## Alternatives rejected

- A land ownership layer, so ground outside Forest Service management reads N/A (#567 option B). It makes the cell obey the N/A rule, but it is a new data source and a new fetch, and is for a separate issue.
- A `regions` member on `/api/closures` beside `coverage`. Explicit, but a change to the public response for a fact the outline already carries, and a second answer the browser would have to keep in step with the first.
- Leaving the hover fixed. It named a failed region's states as covered.

## Consequences

The hover's wording itself still names whole states where the outline takes in only part of Idaho, Wyoming and Nevada; replacing it waits on the maintainer's approval of new copy, and the candidates proposed on the pull request read the same derived list. A ring edit that moves a probe out of its region fails the backend suite before it reaches the browser.
