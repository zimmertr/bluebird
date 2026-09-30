# 0066. The tutorial points at controls and never acts on them

- Status: Accepted
- Date: 2026-09-29
- Decider: TJ
- Issues and PRs: #536
- Cited in code as: #536
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet

## Context

A first visit shows a welcome dialog and then the app. Readers asked for a guided tour. The first build (PR #538) acted a demo on a sandboxed copy of the app, with a drawn pointer, example data and an analysis run. It was 2,800 lines, slow to watch, and every step carried too much.

## Decision

The tutorial is a spotlight and a card. Each of its six steps frames one panel section or one map surface and says one or two sentences about it, in TJ's words. Steps move in about 200 ms. It clicks nothing, types nothing, runs no analysis, and ending it changes nothing in the app. It is voluntary: a secondary button on the welcome dialog and a `Tutorial` link in the panel footer. A target marks itself with `data-tour`, and a step whose target is not on the screen is skipped, so the same tour runs over an empty app and over a report.

One card per panel section rather than per control. The Destinations card says, in one sentence, what the section produces and the four ways to fill it, as an "or" list; the Forecast card covers the model and the calendar the same way. Two steps bring their own target on screen: the Layers step holds the menu open, and the last step shows the results sheet over a small demonstration report of real Cascade summits, built from the test fixtures, that exists only while that card is open and reaches no URL and no storage.

## Alternatives rejected

- A card per control (four destination methods, the model, the calendar): numbered cards read as steps to take in order, and once a lead card said "or", the four after it repeated its list. Cut the day they were added.
- A Layers card that listed the layers: the open menu already lists them.
- Ending the first-visit tour at Analyze, with a results card only once a real report exists: a reader would finish the tour without seeing what the app produces.
- An acted demo on a sandboxed app copy (PR #538): slow, heavy, and it explained the app by doing it for the reader rather than showing where things are.
- A tour library (Driver.js): the app already has the surfaces, the layer and the keys; the overlay is under 200 lines without one.
- Finding a control by its visible text: a reworded label would silently drop a step. The anchor is an attribute the suite checks against the sources.
