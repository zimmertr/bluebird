# 0294. The list menu holds any number of headings open

- Status: Accepted. Supersedes the one-path rule of [0287](0287-list-headings-stand-inside-one-another.md)
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12
- Issues and PRs: #930 (the scroll fix it followed), #892, #848
- Cited in code as: record 0294
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `Menu.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), List search

## Context

Record 0281 opened the Coordinate list menu's regions one at a time, and record 0287 kept that once headings stood inside one another: opening a heading shut every heading not over it. Neither record says why. A reader could not hold North and South America open together, and opening a second region lost their place in the first. A search for a shared word (`America`) showed both, but only where the names share one.

## Decision

- **Any number of headings stand open at once.** A press on a heading opens or shuts that heading alone; its siblings and the other continents stay as they were.
- **Shutting a heading shuts every heading inside it**, so it opens again one level deep rather than on whatever was open under it last.
- **The menu still opens as before**: on the picked list's heading and every heading over it, or on the only top heading when there is one, else with every heading shut.

## Evidence

- Asked on 2026-11-12 whether both Americas could stand open; offered many open, one at a time, or folding the change into PR #930, the maintainer picked many open as a PR of its own.

## Consequences

- `MenuBrowse` holds a set of open headings (`opened`) where it held the deepest open one.
- A long menu grows longer, which the phone sheet now scrolls (PR #930).
