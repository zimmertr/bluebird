# 0065. The tutorial is optional, points only, and shows a recorded demo on Driver.js

- Status: Accepted
- Date: 2026-09-24
- Decider: TJ, the maintainer (issue #536 and its approved plan)
- Issues and PRs: #536
- Cited in code as: #536
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useTour.ts` bullet

## Context

The welcome dialog explains the app in five lines of text that do not point at the controls they name, and several things the app does (clicking a peak to add it, the player, the layers) are not in it at all. A guided tour answers that, but tours that start themselves are the kind people close without reading, and a tour of the results needs results that a first visitor does not have.

## Decision

The tutorial never starts by itself: a secondary button on the welcome dialog and a `Tutorial` link in the panel's footer start it. It points only; a lit control does not respond while the tutorial runs, and the app root is `inert`. Its results steps show a recorded analysis of 22 North Cascades peaks (`src/tour/demoScene.json`, moved forward by whole days to start within the next day), which the app READS in place of the reader's report rather than writing anywhere, so ending it puts the reader's report, panel, address bar and camera back and no upstream call is made. It is built on Driver.js, which loads with the steps and the demo as one chunk only when a reader starts it (`tour/runTour.ts`).

## Evidence

Measured 2026-09-24: Driver.js 1.8.0 is MIT with no dependencies, about 7 KB of JavaScript and 3 KB of CSS gzipped; the demo is 53 KB, 6 KB gzipped. The page's main bundle grew 847 B gzipped (359,055 to 359,902 B); the tutorial's own chunk is 18.7 KB gzipped plus 1 KB of CSS, fetched on the first press. Shepherd.js 15 and Intro.js 8 are AGPL-3.0; React Joyride 3 is MIT with ten dependencies.

## Alternatives rejected

- A tour written in the app: Driver.js's `onPopoverRender` lets every element of its card take the `styles.ts` roles, and its CSS sits in a cascade layer under Tailwind's, so the library costs the design system nothing.
- Shepherd.js and Intro.js: their licence.
- React Joyride: heavier, for nothing Driver.js lacks here.
- Guided practice, where a step waits for the reader to do the thing: slower, and the style most readers find annoying (TJ).
- A live demo analysis: it would spend the reader's Open-Meteo quota and replace what they had on the map.
- Drawing a demo polygon: the map draws a ring only through the path that also writes the address bar.

## Consequences

`utils/tourSteps.test.ts` fails a step whose `data-tour` target is missing from the source, `utils/tourScene.test.ts` fails a demo row missing a column `resultRow()` has, and `e2e/tutorial.spec.ts` walks every step at a desktop and a phone width and fails on a changed address bar or an Open-Meteo request. A new column in the report is a re-capture, `make capture-tour-demo`. The playhead and the table's detail-column sort reset once when the tutorial ends, because both reset per report.
