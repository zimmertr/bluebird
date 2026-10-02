# 0095. The stored forecasts carry the build that wrote them, and only that build reads them back

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #610 (option A)
- Issues and PRs: #610, #566, #337
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastStore.ts` bullet; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)

## Context

Since #337 the browser keeps up to 2 MB of held forecasts in `sessionStorage` under one key and restores them on a reload for the rest of their 15 minutes. The stored values are aggregates, not raw hours, so a release that changes the aggregation in `openMeteoAggregate.ts` changes what they mean. Since #566 (record 0087) a tab left open across a release reloads itself into the new build, which made a reload into a different build inside those 15 minutes an ordinary event rather than a rare one. Nobody had observed wrong numbers from it.

## Decision

The snapshot carries a `build` field, written from the same value `main.tsx` hands `reloadOnStaleChunk`: the entry chunk's own URL, whose hash covers every chunk name it imports. `main.tsx` installs the store (`keepForecastsAcrossReload`) before the root renders. On the read, a snapshot whose `build` is missing or differs is discarded and its key removed, so the tab never holds two. Nothing is written before a build has been handed over.

## Evidence

The privacy page names four storage keys, and `frontend/src/legal.test.ts` fails on a fifth, so the stamp had to live inside the existing key.

## Alternatives rejected

- The build in the key's name (#610 option B). The read path is simpler, but the old build's snapshot, up to 2 MB of a roughly 5 MB quota, stays until the tab closes, and the privacy page would describe a key whose name changes with every release.
- Bumping the key's `_v1` suffix by hand when the aggregation changes (option C). It relies on someone remembering, and leaves the same leftover as B.

## Consequences

Every release costs a reloaded tab its stored forecasts, including releases that did not touch the aggregation, so the first Analyze after one re-fetches what it would otherwise have read back. That is at most 15 minutes of quota the browser had already paid for once.
