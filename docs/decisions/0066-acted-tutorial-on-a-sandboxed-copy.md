# 0066. The tutorial is optional and acts every step out on a sandboxed copy of the app, on Driver.js

- Status: Accepted
- Date: 2026-09-24
- Decider: TJ, the maintainer (issue #536 and the plans approved on it)
- Issues and PRs: #536, #538
- Cited in code as: #536
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `tour/runTour.ts` bullet

## Context

The welcome dialog explains the app in five lines of text that do not point at the controls they name, and several things the app does (clicking a peak to add it, the player, the layers) are not in it at all. A guided tour answers that, but tours that start themselves are the kind people close without reading. A tour that only points also fails at the steps a first visitor finds hardest: "click a peak" means nothing on a map zoomed out too far to label one, and a search, a drawn ring or a model picker is understood by watching it used.

## Decision

The tutorial never starts by itself: a secondary button on the welcome dialog and a `Tutorial` link in the panel's footer start it. It acts every step out while the reader watches: a drawn pointer types a search and picks a result, flies to Dome Peak and clicks its label, draws a ring, pastes two lines, changes the model, picks a window, presses Analyze, turns on the wildfire and smoke layers, and opens a row's forecast. The reader moves with Next, Previous, the arrow keys, and ends it with the X, Escape or Done.

It acts on a second copy of the app, never on the reader's. `useTour` hides the reader's app and makes it inert, and `tour/runTour.ts` mounts `<App sandbox>` in its own React root over it. For as long as that copy exists, every request is answered from recorded and example data (`tour/fixtures.ts`), the copy has a forecast cache and pacing budgets of its own, and nothing is written to the address bar or to storage. Ending the tutorial unmounts the copy, so there is nothing to put back. A step left mid-action, and every step back over an action, mounts the copy afresh in the state that step starts from (`scenario.stateBefore`).

The weather is recorded from Open-Meteo for 22 North Cascades peaks and re-stamped onto the hours the demo asks for. The air quality, the fire and the smoke are invented, deterministic, and named `Example fire` where the reader can see a name; step 8's text says the tutorial uses example data. It is built on Driver.js, loaded with the actions and the data as one chunk only when a reader starts it.

## Evidence

Measured 2026-09-24 against `main` at ddf56ab: the page's main bundle grew 1,237 B gzipped (359,648 to 360,885 B) and its stylesheet 221 B; the tutorial's chunk is 37.5 KB gzipped, of which the recorded data is 22.8 KB, fetched on the first press. In headless Chromium at 360 x 640, the JavaScript heap was 9.1 MB for the app alone, 16.2 MB with the demo's report on screen beside it, and 12.6 MB after the X, the difference being the chunk's code and data. The browser suite walks all 18 steps and sees no request to the pod or to Open-Meteo while the tutorial runs, the same address, the same storage, and the reader's report back after it. Driver.js 1.8.0 is MIT with no dependencies; Shepherd.js 15 and Intro.js 8 are AGPL-3.0; React Joyride 3 is MIT with ten dependencies.

## Alternatives rejected

- Pointing only, with a recorded report read in place of the reader's. Built first on #538 and reversed by TJ: it cannot show a search, a picker, a calendar, a popup or an overlay, which live in component state rather than in the report.
- Acting the steps out on the reader's own app. Every action would need an undo, and a forgotten one would leave a demo peak or a demo model in the reader's link.
- A "tour mode" prop on each acted component. A dozen components with a second mode each, which drift from the real ones; the copy runs the real ones.
- A live demo analysis. It would spend the reader's Open-Meteo quota and depend on the network.
- Guided practice, where a step waits for the reader to do the thing: slower, and the style most readers find annoying (TJ).
- A tour written in the app: Driver.js's `onPopoverRender` lets every element of its card take the `styles.ts` roles, and its CSS sits in a cascade layer under Tailwind's, so the library costs the design system nothing. Shepherd.js and Intro.js for their licence, React Joyride as heavier for nothing Driver.js lacks here.

## Consequences

Two maps are mounted while the tutorial runs. A second copy on the page needed changes the app never had to make with one, each where it lives: fixed element ids and one radio group name became `useId`, `useAnalysisRun` aborts a run when its component unmounts, and the URL writer, the run on open and the preview banner each take a switch for the copy. `tour/scenario.test.ts` holds the air quality to the US AQI's bands (over 100 beside the fire, 50 or under far from it) and each step's starting state, `tour/fixtures.test.ts` holds every answer the closed world gives, and `e2e/tutorial.spec.ts` walks every step at a desktop width and exercises Next mid-action, Previous and the X on a phone. MapLibre's label placement decides at run time whether Dome Peak's label can be clicked; when it cannot, the step adds the peak the way the popup's button would. A new column in the report is a re-capture, `make capture-tour-demo`.
