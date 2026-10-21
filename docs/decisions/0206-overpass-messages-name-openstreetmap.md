# 0206. Overpass messages name OpenStreetMap, and an HTTP code is written without the word HTTP

- Status: Accepted
- Date: 2026-10-21
- Decider: the maintainer (TJ), reviewing PR #784's preview on 2026-10-21
- Issues and PRs: #784, #675 (the 504 line the maintainer quoted when filing it), #735 (the mirrors)
- Cited in code as: record 0206, in `services/osm/mirrors.py` and `services/errors.py`
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/errors.py` bullet
- Related: 0205 (the overlay's two lines, measured the same day in the same way)

## Context

During the Overpass outage of 2026-10-21 the panel notice read `OpenStreetMap (Overpass) took too long. Try again later.` on two lines, and the maintainer asked for a rewrite that fits one. A notice line below Analyze has 281px for text at 12px, and every Overpass message leads with one constant, `PROVIDER` in `services/osm/mirrors.py`, through the templates `classify_http_error` in `services/errors.py` shares with every other provider.

Measured 2026-10-21 in the notice itself, in Chrome on the maintainer's Mac:

| Label | Timeout line | Longest line that still wraps |
|---|---|---|
| `OpenStreetMap (Overpass)` | 324px, wraps | all nine templates wrap |
| `OpenStreetMap` | 258px | `OpenStreetMap failed (HTTP 504). Try again later.` at 284px, `OpenStreetMap rejected the request. Try again later.` at 297px (both templates then changed, below) |
| `Overpass` | 222px | none, the longest 261px |

## Decision

- `PROVIDER` is `OpenStreetMap`, the name the footer already credits. The two Overpass budgets keep their per-mirror metric labels, which never read it.
- The shared templates write an HTTP code bare: `failed (504)` and `error (418)` where they said `failed (HTTP 504)` and `error (HTTP 418)`. The first is the line an outage shows, which the label alone left 3px over; the second follows it so one fact has one grammar. Every provider's messages change with the template, Open-Meteo's included, and the browser's own `Open-Meteo error (500). Try again later.` in `openMeteo.ts` follows for the same reason.
- The 401 and 403 template says `denied access` where it said `rejected the request`, which was 297px with the label alone; the new line is the length of the timeout line, about 258px. The maintainer chose it on the same day, after the PR's review, although no mirror has answered 401 or 403.

## Alternatives rejected

- `Overpass` alone. Every line fits, but the word names the API rather than the map, and a reader who knows one knows the other.
- Shortening `took too long` to `timed out` while keeping the parenthetical: 303px, still two lines.

## Consequences

`test_errors.py` pins the three templates. The pod's `detail` wording is outside the API's SemVer promise (`docs/API.md`, What version 1.0 promises), so no major release is needed. Record 0118 keeps the 504 line as the maintainer quoted it in 2026, which is history rather than a spelling to update.
