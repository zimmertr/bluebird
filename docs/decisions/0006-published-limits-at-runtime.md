# 0006. The browser reads its limits from /api/capabilities, and its compiled numbers are only fallbacks

- Status: Accepted
- Date: 2026-07-31 (git: the merge of #215). #426 extended it to every limit on 2026-09-17.
- Decider: TJ (git: author and merger of #215)
- Issues and PRs: #152, #215, #393, #426
- Cited in code as: #152, #393
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", its opening sentences

## Context

The browser enforced limits from compiled copies of the server's constants. A deployment with other limits, or a changed default, left the browser out of step with the server it talks to (#152).

## Decision

The browser reads every limit it acts on from `GET /api/capabilities` through `useCapabilities.ts`. The compiled numbers are only the fallback for the moment before the fetch answers, or for a deployment where it fails. Since #393 that covers the analysis cap, the results ceiling, the polygon area, the archive reach, the air-quality horizon, and the three window bounds as one `WindowLimits` value. The modules that computed with compiled numbers now take them as arguments.

## Evidence

No dated measurement. At 971fede the candidate cap was `MAX_ANALYZE_PEAKS = 1_500`; `GET /api/capabilities` publishes the current value.

## Alternatives rejected

- A compiled mirror of every limit: mirrors drift. The candidate cap keeps its mirror, `MAX_ANALYZE_DESTINATIONS`, only because the browser enforces it for analyses that never touch the server.

## Consequences

`useCapabilities.test.ts` reads `forecastWindow.ts` as text, so a bound can be spelled only in its own fallback declaration. The linter's `area-cap-published` check fails the polygon cap's number in the map and panel sources. Mirror row 23 lists this as not a mirror by design. `FUTURE_LIMIT_DAYS` is the one limit nothing publishes: see [0013](0013-accept-edge-not-data-edge.md).
