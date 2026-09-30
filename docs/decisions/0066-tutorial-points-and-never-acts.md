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

The tutorial is a spotlight and a card. Each of its ten steps frames one control the screen already holds and says one or two sentences about it, verbatim from the approved list. Steps move in about 200 ms. It fetches nothing, types nothing, runs no analysis, and ending it changes nothing in the app. It is voluntary: a secondary button on the welcome dialog and a `Tutorial` link in the panel footer. A control marks itself with `data-tour`, and a step whose control is not on the screen is skipped, so the same tour runs over an empty app and over a report.

## Alternatives rejected

- An acted demo on a sandboxed app copy (PR #538): slow, heavy, and it explained the app by doing it for the reader rather than showing where things are.
- A tour library (Driver.js): the app already has the surfaces, the layer and the keys; the overlay is under 200 lines without one.
- Finding a control by its visible text: a reworded label would silently drop a step. The anchor is an attribute the suite checks against the sources.
