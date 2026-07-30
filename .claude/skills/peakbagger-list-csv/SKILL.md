---
name: peakbagger-list-csv
description: Crawl one or more peakbagger.com peak lists into bluebird examples/*.csv files for the "Custom (CSV)" destination type. Use when given a peakbagger list URL or list id (lid), or asked to create/add a peak list CSV (e.g. "create CSV list", "add the Bulgers/Home Court/Smoot list").
---

# Peakbagger list → bluebird CSV

Turns a peakbagger.com list (`list.aspx?lid=<N>`) into `examples/<list-slug>.csv`, matching
`examples/washington-bulger-list.csv`. One CSV row per peak in the list — no sampling, no
truncation.

**Row format** (mirrors `examples/washington-bulger-list.csv` exactly):

```
# <List Title> — ordered highest to lowest.
# Source: peakbagger.com list <lid>. Coordinates (WGS84 decimal degrees, 6 places)
# from each peak page; Bluebird resolves elevation itself from OpenStreetMap.
# Paste the rows below into the "Custom (CSV)" destination type. Format: Latitude, Longitude, Name
46.851731, -121.760395, 1. Mount Rainier
```

Four comment lines, then `Lat, Lon, N. Name`. The name carries **no** elevation: bluebird
matches each coordinate to its OSM peak and fills the Elevation column itself (issue #207),
so a figure here would only be a second number to disagree with the one on screen.

## The one thing that makes this hard

**peakbagger.com is behind Cloudflare's "Just a moment…" JS challenge.** WebFetch and plain
curl both get a 403 — do not waste turns trying them, and do not try to defeat the challenge.

Fetch through the **Wayback Machine** instead, which serves the same static data:

```
https://web.archive.org/web/2025id_/https://www.peakbagger.com/peak.aspx?pid=2296
```

- The `id_` modifier returns the **original bytes** rather than Wayback's rewritten HTML.
- Those bytes are **gzip-compressed** — always pass `curl --compressed`.
- A bare year (`2025id_`) redirects to the nearest snapshot, so you never need to look up an
  exact timestamp. Follow redirects with `-L`.
- Avoid `archive.org/wayback/available` — it rate-limits aggressively (429) and is unnecessary.

The bundled scripts already do all of this. Use them rather than re-deriving it.

## Procedure

Work in a scratchpad directory (not the repo). `SKILL_DIR` below is this skill's folder.

### 1. Parse the list pages

```bash
cd <scratchpad>
python3 <SKILL_DIR>/scripts/fetch_list.py 5005 5045 21307
```

Writes `peaks<lid>.json` per list and prints the peak count, title, derived filename slug, and
whether the list is elevation-descending. **Sanity-check the count against the list's own
name** ("Top 100" should yield 100). If it doesn't match, the markup changed — inspect the HTML
before going further rather than shipping a short list.

### 2. Fetch coordinates — ONE serial crawl, all lists in a single process

This is the slow part: one Wayback request per peak.

> **Do not parallelise this. Measured on a 300-peak run: one serial stream sustains ~1
> peak/sec; three concurrent crawls collapsed to ~2 peaks/MINUTE — roughly 30x slower.**
> Wayback rate-limits per IP, so splitting the work across subagents makes it dramatically
> worse, not better. Fanning out one-subagent-per-list is the obvious move here and it is
> wrong.

Pass every lid to a single process:

```bash
python3 <SKILL_DIR>/scripts/fetch_coords.py 5005 5045 21307 --rounds 3
```

At ~1s/peak, 300 peaks takes ~5–10 minutes. Run it **backgrounded via the harness's
`run_in_background`** (not a shell `&`, which gets denied) and poll the log, or foreground it
with a ≥600000 ms timeout. Wait for `ALL DONE` / the per-list `RESULT lid=…: N/100 resolved`.

The script caches each resolved page under `pages/<pid>.html` and checkpoints
`coords<lid>.json` every 20 peaks, so it is **idempotent and resumable** — re-running only
retries what's missing, and killing it mid-flight loses nothing. It distinguishes a throttled
response (`000`/`429`/`503` → back off and retry the *same* URL) from a genuine miss (`404` →
try the next snapshot year), which is what keeps a rate-limit from being misrecorded as a
missing peak. Rerun until every list reports `N/N`.

For anything still failing after the rounds, probe that pid by hand with another snapshot year
or the non-www host:

```bash
curl -s -L --compressed "https://web.archive.org/web/2022id_/https://peakbagger.com/peak.aspx?pid=<PID>" \
  | grep -oE '[-0-9.]+, [-0-9.]+ \(Dec Deg\)'
```

(Match on `(Dec Deg)` itself, not on the `<td>` that opens the cell — see the ordering gotcha
below, which the obvious grep gets wrong.)

Add a manual find to `coords<lid>.json` as `"<pid>": [lat, lon]`. **Never guess, approximate,
or recall a coordinate from memory** — every value must come from that peak's own page.

**Where subagents *do* help:** the crawl is I/O-bound and serial, so it doesn't parallelise —
but the per-list **verification and CSV build** (steps 3–4) is independent per list and safe to
fan out to Haiku subagents once coordinates are in hand. Give each one the scratchpad path,
its `lid`, the target output path, the plausible lat/lon box for the region, an explicit
**"never invent a coordinate"** instruction, and a heads-up about any known list quirks
(duplicate peak names, a famous peak legitimately absent) so they don't "fix" them.

### 3. Build the CSV

```bash
python3 <SKILL_DIR>/scripts/build_csv.py <lid> /path/to/repo/examples
```

Derives the filename and header from the list title. Override with `--out name.csv` and
`--headline '# ...'`. It **refuses to write** if any peak lacks coordinates — a partial file is
never acceptable, so report the gap instead of working around the guard.

### 4. Verify before reporting

```bash
python3 <SKILL_DIR>/scripts/verify_csv.py <lid> /path/to/examples/<slug>.csv \
  --bbox 45.5 49.1 -124.8 -116.9      # Washington State; adjust per region
```

Exits non-zero and lists every problem. It cross-checks each row's **name and elevation against
`peaks<lid>.json`** (not just the file's shape), so a coordinate bound to the wrong peak, a
dropped row, or a mangled elevation is caught — plus row-count, 6-decimal formatting, gapless
numbering, duplicate coordinate pairs, elevation ordering, and the optional bounding box.

Then spot-check two or three peaks against their peak pages by eye. Sanity anchor: Mount
Rainier is `46.851731, -121.760395`.

## Conventions and gotchas

- **The WGS84 cell has two orderings.** Peak pages list the same point in several notations and
  are inconsistent about which comes first — some lead with decimal degrees, others with DMS:

  ```html
  <td>46.851731, -121.760395 (Dec Deg)<br/>46&deg 51' 6'' N, ...     <!-- Mount Rainier -->
  <td>48&deg 31' 25'' N, ...<br/>48.523611, -120.816193 (Dec Deg)    <!-- Black Peak -->
  ```

  A regex anchoring the decimals to the cell opening matches only the first form and silently
  drops every DMS-first peak — they look like missing snapshots, not a parser bug. Always grab
  the whole cell, then find the pair tagged `(Dec Deg)` inside it. `fetch_coords.parse_coords()`
  does this; test any change against one page of each form.
- **A high FAILED rate means a parser bug, not a missing archive.** If more than a couple of
  peaks fail, stop and probe one by hand before burning retry rounds — check whether the page
  actually returns 200 and contains `WGS84`. That is how the ordering bug above was caught.

- **Number by row position, not peakbagger's rank column.** That column contains ties and gaps
  on some lists; `seq` in `peaks<lid>.json` is already the row position.
- **Normalize elevation commas.** The list page prints `14,406` but `9419` — the CSV uses
  comma-grouping throughout (`9,419 ft`). `build_csv.py` handles this.
- **Duplicate peak names are real.** Lists legitimately contain two "Granite Mountain" or two
  "Red Mountain" at different elevations and pids. The `N.` prefix disambiguates them; do not
  dedupe.
- **A famous peak may be absent.** List 5045 ("100 Peaks at Mount Rainier N.P.") genuinely does
  not include Mount Rainier. Verify against the source before "correcting" an omission.
- **Commas in names are safe.** bluebird's Custom (CSV) parser splits on the first two commas
  only, so everything after them is the name.
- Coordinates are stable across snapshot years — any snapshot is as good as another.

## Files

- `scripts/fetch_list.py` — list page → `peaks<lid>.json` (title, slug, ordered peaks)
- `scripts/fetch_coords.py` — peak pages → `coords<lid>.json` (cached, resumable, throttle-aware)
- `scripts/build_csv.py` — both JSONs → `examples/<slug>.csv` (refuses on missing coords)
- `scripts/verify_csv.py` — cross-checks the CSV against `peaks<lid>.json`; non-zero on problems

All four are stdlib-only (they shell out to `curl`), so they need no venv and no `pip install`.
