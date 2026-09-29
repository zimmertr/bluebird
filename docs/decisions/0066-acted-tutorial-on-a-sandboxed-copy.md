# 0066. The tutorial is optional and acts every step out on a sandboxed copy of the app, one step at a time

- Status: Accepted
- Date: 2026-09-24, revised 2026-09-29
- Decider: TJ, the maintainer (issue #536 and the plans approved on it)
- Issues and PRs: #536, #538
- Cited in code as: #536
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `tour/runTour.ts` bullet

## Context

The welcome dialog explains the app in five lines of text that do not point at the controls they name, and several things the app does (clicking a peak to add it, the player, the layers) are not in it at all. A guided tour answers that, but tours that start themselves are the kind people close without reading. A tour that only points also fails at the steps a first visitor finds hardest: "click a peak" means nothing on a map zoomed out too far to label one, and a search, a drawn ring or a model picker is understood by watching it used.

## Decision

The tutorial never starts by itself: a secondary button on the welcome dialog and a `Tutorial` link in the panel's footer start it. It has 22 steps in 16 sections, where a gesture a reader thinks of as one stays one step: search, click a peak and add it, draw a ring corner by corner and ask for its peaks, paste, compare a model and rank by it, pick a day and its hours, the Metrics table, Analyze, the wildfire and smoke layers, the ranking, a highest AQI that takes the smoky rows away, a row's forecast on the map, and then the legend, the player, the results tools and the Tutorial link, pointed at.

**A card is read before anything moves.** Each step opens with its card and its lit area, and nothing else. Next plays the step's action with a drawn pointer at a pace a reader can follow (a glide of 700 to 1,100 ms, 500 ms before and after a press, 110 ms a character, 2 s flights, all skipped where motion is unwelcome). Next again while it plays finishes it where it was going. Space, Enter and the right arrow go on, the left arrow goes back, Escape ends it; only the reader's own keys count, and a held key counts once.

**The card stands in one place.** On a desktop it is centred on the map just above the player, at the height where the map is shortest (the results open), so it is on the map and clear of the results at every step. On a phone it spans the bottom edge, and the top from the results on, since that edge then belongs to the results sheet. It shows the section's title, the step's text and the count in the section, with a bar per section for the whole run, and it is the same height at every step. Nothing the step lights or opens is under it: on a desktop the camera frames clear of it and a map popup is panned clear, and on a phone the demo's map and drawer end where the card begins.

It acts on a second copy of the app, never on the reader's. `useTour` hides the reader's app and makes it inert, and `tour/runTour.ts` mounts `<App sandbox>` in its own React root over it. For as long as that copy exists, every request is answered from recorded and example data (`tour/fixtures.ts`), the copy has a forecast cache and pacing budgets of its own, and nothing is written to the address bar or to storage. Ending the tutorial unmounts the copy, so there is nothing to put back. Previous mounts the copy afresh in the state the step before starts from (`scenario.stateBefore`) with the camera it had, and plays again, instantly, what a press had left open there.

The weather is recorded from Open-Meteo for 22 North Cascades peaks and re-stamped onto the hours the demo asks for. The air quality, the fire and the smoke are invented, deterministic, and named `Example fire` where the reader can see a name; the Analyze step's text says the tutorial uses example data. The air quality runs through every band of the US AQI, one peak per band from hazardous down, so the markers and the table show every colour. The card, the dim and the keys are the app's own, loaded with the actions and the data as one chunk only when a reader starts the tutorial.

## Evidence

Measured 2026-09-29 against the first acted build at 64fd591, gzipped at level 9: the page's main bundle is 361,516 B against 360,886 B, the page's stylesheet 8,807 B against 8,606 B (the card's classes join it, where Driver.js's stylesheet was a 984 B file of its own in the chunk), and the tutorial's chunk 34,192 B against 37,524 B, of which the recorded data is 22.8 KB. The browser suite walks all 22 steps at 1280 x 800 and at 360 x 640 and holds at each one that what the step lights is on screen, that the card covers none of it and no open list, dialog or map popup, and that the card has not moved, apart from the phone's one switch of edge; the same walk passed at 1366 x 768, 1024 x 768 and 2560 x 1440 while it was built. It also sees no request to the pod or to Open-Meteo, the same address and storage afterwards, and the reader's report back.

## Alternatives rejected

- Driver.js, which the first acted build used. It placed its card from the lit box, so the card jumped between steps and, with the whole map lit, stood far from the peak a step was about and over the Layers menu; it moved the card as the lit box followed an action; and it took only the arrow keys, dropping them for 400 ms after a step opened. Working round each of those would have left it supplying a card, a dim and a key handler, which is about 250 lines to own instead (TJ, 2026-09-24).
- A card placed beside each section's target, one place per section. Simpler to reason about per step, but the reader's eye has to find the card again at every section; one place for the run is what the reader asked for (TJ, 2026-09-29).
- Playing a step's action as its card appears, which the first acted build did: the reader was reading while the screen changed under the text.
- Pointing only, with a recorded report read in place of the reader's. Built first on #538 and reversed by TJ: it cannot show a search, a picker, a calendar, a popup or an overlay, which live in component state rather than in the report.
- Acting the steps out on the reader's own app. Every action would need an undo, and a forgotten one would leave a demo peak or a demo model in the reader's link.
- A "tour mode" prop on each acted component. A dozen components with a second mode each, which drift from the real ones; the copy runs the real ones.
- A live demo analysis. It would spend the reader's Open-Meteo quota and depend on the network.
- Guided practice, where a step waits for the reader to do the thing: slower, and the style most readers find annoying (TJ).
- Painting the air quality with the forecast grid. The markers and the table carry the colours; the grid would add a second encoding of the same numbers to a step that is about the ranking (TJ, 2026-09-24).

## Consequences

Two maps are mounted while the tutorial runs. A second copy on the page needed changes the app never had to make with one, each where it lives: fixed element ids and one radio group name became `useId`, `useAnalysisRun` aborts a run when its component unmounts, and the URL writer, the run on open and the preview banner each take a switch for the copy. `tour/scenario.test.ts` holds the air quality to the US AQI's bands (over 100 beside the fire, 50 or under far from it) and each step's starting state, `tour/fixtures.test.ts` holds every answer the closed world gives, `tour/place.test.ts` holds the card's one place and the camera's insets, and `e2e/tutorial.spec.ts` walks every step at a desktop and a phone width and exercises Next mid-action, Previous and Escape on a phone. MapLibre's label placement decides at run time whether Dome Peak's label can be clicked; when it cannot, the step opens the peak's popup the way a click would. A new column in the report is a re-capture, `make capture-tour-demo`.
