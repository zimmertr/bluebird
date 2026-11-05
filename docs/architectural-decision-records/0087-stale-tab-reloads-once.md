# 0087. A tab left open across a release reloads itself once, silently, and at most once per build

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #566 (option A)
- Issues and PRs: #566, #354
- Cited in code as: none
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/staleChunk.ts` bullet; [`docs/TRAFFIC.md`](../TRAFFIC.md), the cache headers section

## Context

Every release renames the hashed chunks and the image carries only the new ones. A tab that loaded before the release asks for the old names the first time it reaches a lazy surface: the chart, the tour, or the tour's demonstration report. On 2026-10-01, with production at v0.91.4, the v0.91.0 chart chunk and demonstration report chunk answered `404`. On a desktop the chart renders when an analysis lands, so the first Analyze in such a tab replaced the app with the root error screen, and its Try again could not recover, because React keeps a rejected lazy payload and throws it again on every render. `no-cache` on the document (#354) fixes only a new page load. 87 of the 100 commits since 2026-09-15 changed the frontend.

## Decision

`main.tsx` installs a `vite:preloadError` listener before the root renders, and the listener reloads the page. The reload is silent: no line is shown first, since the URL carries the inputs and a reload recovers them. The guard is a `sessionStorage` entry holding the build that reloaded (the entry chunk's URL, whose hash covers every chunk name it imports). A build that finds its own name there does not reload again, and the failure reaches the root error screen. A storage that cannot be read or written means no reload, because an unguarded reload can loop.

## Evidence

Read in a production build of this branch on 2026-10-01: the chart and the tour (`React.lazy`) and the demonstration report (a bare `import()` inside `useTour`) all go through Vite's preload helper, which dispatches `vite:preloadError` when the import itself rejects, not only when a preloaded dependency fails, so one listener covers all three.

## Alternatives rejected

- A local error boundary around each lazy surface, or a `lazy` factory that retries the import (#566 option B). A retry asks for the same missing file, and the rest of the app staying up is worth little when the chart can only come back through a reload anyway.
- A flag that a successful load clears. No event says a lazy chunk loaded, so nothing could clear it, and a flag that is never cleared blocks the reload a later release needs.
- A line on screen before the reload. It would be new copy, and the reload costs the reader only what the URL does not carry.

## Consequences

The reader loses whatever lives outside the URL: an analysis in hand must be run again. The root error screen may show for the moment between the failure and the reload, because the event is left uncancelled. A build whose own chunk is missing reloads a stale tab twice in all: once from the old build into it, and once from itself, before the guard stops it.
