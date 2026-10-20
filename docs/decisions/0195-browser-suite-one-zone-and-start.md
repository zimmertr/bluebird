# 0195. The browser suite runs in one time zone from one fixed start, and its clock runs on from there

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #690, 2026-10-18, answering the audit's question on the Playwright suite's dates: one `timezoneId` and a fixed start that still runs forward, with one shared date helper.
- Issues and PRs: #690, #412 (the browser suite), #772
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands, the browser suite; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), The browser suite

## Context

The Playwright specs built their dates from the runner's own clock and zone, through five copies of a helper that turned a day offset into a link's `d1`/`d2`. A runner in UTC and a Mac in Pacific time could put "a window three days out" on different local days, and a window measured against the real clock expires: hard-coded forecast windows had broken the unit suites before.

## Decision

- Both Playwright configs set `timezoneId: 'America/Los_Angeles'`, the zone Vitest pins with `TZ`.
- A `page` fixture in `e2e/fixtures.ts` runs `page.clock.install({ time: START })` before the first navigation, with `START` at 2026-09-15 17:00 UTC.
- `isoDay(offset)` in `e2e/fixtures.ts` is the one helper that names a local day from `START`.
- `install` rather than `setFixedTime`: the page's clock starts at `START` and runs on in real time, with timers, intervals and animation frames firing as they would.

## Evidence

The full suite passed, 52 of 52, on 2026-10-18 against an image built from this change.

## Alternatives rejected

- **`page.clock.setFixedTime`.** It freezes `Date`, and with it every elapsed-seconds readout the progress card shows.
- **The runner's real clock.** Every date a spec spelled would one day fall outside the forecast horizon.

## Consequences

The render probe (`make perf`) gets the same zone and clock. A spec that needs another instant installs its own clock. Every third-party answer is a fixture, so a fixed 2026 start never meets a live provider that would refuse it.
