# 0258. Coordinate search links the ready-made lists beside its subheading

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md)
- Date: 2026-10-30
- Decider: the maintainer (TJ), on issue #838, 2026-10-30
- Issues and PRs: #838, #710, #311
- Cited in code as: #838
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

The Coordinate search box shows the format and one Mount Rainier row as its placeholder. The repository carries four whole lists in that format under `csv-examples/`, and until this record the app linked to none of them: the only pointer was the last sentence of the Coordinate search section in `USAGE.md`. A reader in the panel had one row to go on.

The lists cannot be served by the app. `.dockerignore` leaves `csv-examples/` out of the image, so a link has to go to the repository.

## Decision

- **`Examples` sits beside the `Coordinate search` subheading**, on its baseline at the row's right edge, and opens `csv-examples/` on GitHub in a new tab like the panel's other outbound links (option A on #838).
- **The whole word is the link.** The request first read `Examples: here`; a link named `here` reads as nothing in a screen reader's list of links (WCAG 2.4.4).
- **The subheading stays `Coordinate search`**, so record 0156's three headings still read as a set.
- **The URL is `CSV_EXAMPLES_URL` in `utils/contact.ts`, built from `REPO_URL`**, so the repository move in #311 changes it with the rest.

The link wears `LINK` inside a `TEXT.caption` line, the footer's recipe, since `LINK` sets no size of its own.

## Alternatives rejected

- **Rename the subheading to `CSV search` or `Coordinate CSV search`** (options B and C on #838): "CSV" is jargon to a hiker, the box also takes lines typed by hand, and the rename breaks 0156's `Map search` / `Coordinate search` / `Polygon search` set while still pointing at no example.
- **A button that loads a list into the box**: it needs the lists bundled into the image, a larger change than a pointer.

## Consequences

The link goes to a code site rather than a page of the app. If the repository moves (#311), `REPO_URL` moves the link with it.
