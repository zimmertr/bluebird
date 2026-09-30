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

The tutorial is a spotlight and a card. Each of its seven steps frames one control or one section the screen already holds and says one or two sentences about it, verbatim from the approved list. Steps move in about 200 ms. It fetches nothing, types nothing, runs no analysis, and ending it changes nothing in the app. It is voluntary: a secondary button on the welcome dialog and a `Tutorial` link in the panel footer. A control marks itself with `data-tour`, and a step whose control is not on the screen is skipped, so the same tour runs over an empty app and over a report.

The first card frames the Destinations section and says, in the welcome dialog's sentence, that its four methods are options that work together. There is no card per method.

## Alternatives rejected

- A card per destination method, four after the Destinations card: numbered cards read as steps to take in order, and once the lead card said "or", the four repeated its list. Cut the day they were added. The cost is that no card points at the search box or the map, which sit outside the section; the lead card names both.

- An acted demo on a sandboxed app copy (PR #538): slow, heavy, and it explained the app by doing it for the reader rather than showing where things are.
- A tour library (Driver.js): the app already has the surfaces, the layer and the keys; the overlay is under 200 lines without one.
- Finding a control by its visible text: a reworded label would silently drop a step. The anchor is an attribute the suite checks against the sources.
