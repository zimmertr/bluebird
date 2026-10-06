# 0104. A refused snow depth file is no grid for its day, and the grid before it is not served in its place

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issue #629, 2026-10-06: option A only, "a refused SNODAS file degrades snow depth to null for the day; no stale grid is served"
- Issues and PRs: #629, #595, #449, #463
- Cited in code as: #629
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snodas.py` bullet

## Context

The pod reads one SNODAS archive a day from NSIDC ([0054](0054-snodas-snow-depth.md)). Until #629 the archive was trusted: the download was read whole, `tarfile.open` unwrapped any compression around it, each member was inflated in full before its size was compared with the header, and the header's numbers were read with `float()`, which accepts `nan` and `inf`. A header holding either passed every check and built a grid whose every lookup raised, so `POST /api/destinations` and every server analysis answered 500 until the next day's file. A file refused for any other reason left the previous grid in the cache, still served with its own date. The security review found both by reading (#595, findings UF-3 and UF-4), and the issue offered two shapes for a refusal: bound and validate the file, then answer null for the day (A), or keep serving the previous grid (B).

## Decision

The download, the outer archive and each member are bounded before they are read, and every header number must be finite. A file that breaks any of those is refused, and the fetch answers `Refused` for that analysis date instead of raising. The cache holds it like a grid: every row reads null, the report carries no `snow_analysis_date`, and the hourly check finds the day in hand and does not download the same file again. The day before is not fetched to stand in for it, and the grid the cache already held is replaced rather than kept. The next day's file replaces the refusal when NSIDC publishes it. An NSIDC that cannot be reached is not a refusal, and still leaves the last good grid standing with its date. `fill_snow_depth` also degrades a grid whose lookup raises to null rather than letting it fail the route, as a backstop behind the header checks.

## Evidence

Measured 2026-10-06. Archive sizes by `HEAD` at NSIDC over thirteen days: 6.3 MB on 2026-10-05, 35 to 45 MB through the 2023 to 2026 winters, 48.0 MB at the largest (2026-01-25). The depth header on 2026-10-05 inflates to 3,381 bytes, and the grid is 8192 by 4096 two-byte samples, 64 MiB. The bounds are `MAX_ARCHIVE_BYTES` (96 MiB), `MAX_HEADER_BYTES` (64 KiB) and `MAX_GRID_BYTES` (128 MiB) in `snodas.py`. The bounded reader read the 2026-10-05 archive to the same 64 MiB as `gzip.decompress` in 0.08 s, with a traced peak of 128 MiB against 142 MiB.

## Alternatives rejected

- Keep serving the previous grid on a refusal (option B): its date would caption a column the reader takes for today's, and a refusal is a fault in the file rather than an outage that a held copy bridges.
- Raise on a refusal and let the cache's failure backoff retry: the same bad file would be downloaded again every backoff, about 12 times an hour, for the rest of the day.
- Fall back to the previous day's file when today's is refused: the same stale grid as option B, fetched on purpose.

## Consequences

`test_snodas.py` holds the refusal, its date and its replacement by the next day's file, and `test_destinations.py` holds the route answering 200 with null depths over a grid that cannot answer. A refused file is counted as a failed refresh, so the "Overlay snapshot refresh failures per hour" panel (`docs/CICD.md`) still sees it. A file NSIDC republishes under the same date after a refusal is not read until the next day.
