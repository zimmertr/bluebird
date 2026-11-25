# 0344. A map layer that is on and failing says so in the Analyze button's messages

- Status: Proposed, in the reliability PR; accepted when the maintainer merges it. Extends 0260.
- Date: 2026-11-25
- Decider: the maintainer, in the reliability plan's mitigation 10 ("each layer's approved 'unavailable' sentence shown in the message list rather than only logged")
- Issues and PRs: #580, #834, #1001
- Cited in code as: record 0344
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `layerFailures.ts` and `panelMessages.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `overlays/recovery.ts` and `features.ts`; [`docs/USAGE.md`](../USAGE.md), Map layers; [`docs/RELIABILITY.md`](../RELIABILITY.md), Mitigations
- Related: 0106 (a check's notice follows its layer), 0260 (which lines open the list)

## Context

The wildfire, closure, fire activity, smoke and landmark layers each threw an approved sentence when their fetch failed, and then only logged it, so the layer drew nothing. A reader could not tell "no fires here" from "the fire feed is down" (audit of main at 86e397f6, 2026-11-25).

## Decision

- Each of those layers reports, through the recovery every one of them already shares (`overlayRecovery`'s `onFailing`), when it starts failing and when it stops: a fetch landing, or the layer switched off. The app holds the set (`failingLayers`).
- Each failing layer is one warning in the Analyze button's messages, in the sentence its own fetch throws: `Wildfire data unavailable. Try again later.`, `Fire activity data unavailable. Try again later.`, `Smoke data unavailable. Try again later.`, `Closure data unavailable. Try again later.` and `Map destinations unavailable. Try again later.`. The two closure layers share one line, as they share one sentence and one feed.
- Each line is keyed on its condition (`layer:*`) and opens the list when it arrives (`LIST_OPENING_KEYS`), for record 0260's reason: no change of the reader's caused it, and an empty layer is what a reader would least think to question. A failure that keeps failing as the reader pans says nothing new.
- The landmark markers have no switch, so they count as on wherever they draw. Where the deployment publishes `discovery_source` as anything but `places`, their refusal is how that deployment works (no places table, or a first fill not finished), so it is left out.

## Evidence

- 2026-11-25: every one of the five fetches already threw its approved sentence and logged it, and every one already recovered through `overlayRecovery`, so the report needs one callback and no new copy.

## Consequences

- With the Wildfires layer on, a failed wildfire check and a failed layer are two lines, because they are two requests over two boxes (record 0106).
- Opening the list for a layer failure is the maintainer's to reverse: removing the five keys from `LIST_OPENING_KEYS` leaves the lines counted on the badge alone.
