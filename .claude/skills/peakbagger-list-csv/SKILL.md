---
name: peakbagger-list-csv
description: Crawl one or more peakbagger.com peak lists into Bluebird Forecast's coordinate lists, a frontend/src/coordinate-lists/<id>.csv and an entry in lists.json each, the lists the Coordinate list field under Coordinate search offers. Use when given a peakbagger list URL or list id (lid), or asked to create/add a peak list (e.g. "add the Bulgers/Home Court/Smoot list").
---

# Peakbagger list → Bluebird Forecast coordinate list

Turns a peakbagger.com list (`list.aspx?lid=<N>`) into two things under
`frontend/src/coordinate-lists/`: `<id>.csv`, one row per peak of the list, and the list's entry
in the manifest `lists.json` (record 0281). One process does all of it, `scripts/crawl.py`.

**A list's words are the maintainer's.** Its `name` is the menu's string, in title case (record
0282). Its `description` is one or two sentences. Its `id` is a slug that never changes once
shipped, because a share link names a list by it. Its `region` is one of the manifest's `regions`.
Show the maintainer the exact name, description, slug and region, and get a yes, before you crawl.
A new region heading is a string to approve too.

**Row format** (every CSV there matches it exactly):

```
46.851731, -121.760395, Mount Rainier
```

Rows only: no headline, no comment line, just `Lat, Lon, Name` in the list page's own order. The
name carries **no** list number, because Bluebird Forecast ranks the rows and numbers them itself.
It carries **no** elevation either: the app reads each summit's elevation from OpenStreetMap (issue
#207), so a figure here would only be a second number to disagree with the one on screen.

## The one thing that makes this hard

**peakbagger.com is behind Cloudflare's "Just a moment…" JavaScript challenge.** WebFetch and plain
curl both get a 403. Do not spend turns on them, and do not try to defeat the challenge.

The crawl reads the **Wayback Machine** instead, which holds the same static pages:

```
https://web.archive.org/web/2025id_/https://www.peakbagger.com/peak.aspx?pid=2296
```

- The `id_` modifier returns the captured bytes rather than Wayback's rewritten HTML.
- A bare year redirects to the newest capture, so no timestamp is looked up for most pages.
- The archive also holds challenge pages and refusals. When the newest capture is no use, the crawl
  asks Wayback's index (`/cdx/search/cdx`) once for that page's good captures and tries those.

`scripts/wayback.py` does all of this over one kept-alive connection, a page a second. Use it
rather than re-deriving it.

**Run one crawl at a time, and never split one across subagents.** Wayback throttles per address:
one stream holds its pace, and three at once ran about thirty times slower (measured on 300 peaks).

## Procedure

Work in a scratchpad directory, never in the repo. `SKILL_DIR` is this skill's folder.

### 1. Write the spec

`spec.json` is a JSON array with one object per list:

```json
[
  {
    "lid": "5035",
    "id": "wa-snoqualmie-peak-pin",
    "name": "Snoqualmie Peak Pin",
    "description": "The Mountaineers' twenty peaks around Snoqualmie Pass, a pin since the 1910s.",
    "region": "Washington",
    "credit": "The Mountaineers",
    "expect": 20,
    "bbox": [45.5, 49.1, -124.9, -116.9]
  }
]
```

- `lid`: the number in the list's URL.
- `id`, `name`, `description`, `region`: the approved words.
- `credit`: who chose the peaks, a club or an author, or the rule that picks them. It goes into
  `lists.json`, and `NOTICES.md` credits the same people.
- `expect` (optional): how many peaks the list should hold. Give it whenever the name or the
  description states a count. A roster of another size fails the list instead of shipping it.
- `bbox` (optional): `[lat min, lat max, lon min, lon max]`, a box every peak must fall in.
- `roster` (optional): a roster read live, for a list the archive holds out of date (below).

The lists go into the manifest in the spec's order, after the lists already there, and the menu
shows a region's lists in the manifest's order. So order the spec the way the menu should read.

### 2. Crawl

```bash
cd <scratchpad>
python3 <SKILL_DIR>/scripts/crawl.py spec.json --repo /path/to/repo
```

Run it **in the background through the harness's `run_in_background`** and wait for it to finish.
Do not poll its log. Allow three or four seconds a peak: Wayback's own response time is most of it
(measured 2026-11-11). It prints one summary and exits non-zero when any list was not written.

For each list it reads the list page, reads every peak's coordinates, writes the CSV, writes the
manifest entry with `peaks`, `source` and today's date as `crawled`, and checks the result against
the roster. A list with any problem writes nothing and is named in the summary with the reason.

What it saves on the way:

- A peak on several lists is read once.
- A peak already in a shipped CSV is read from that CSV, not from the archive.
- Everything fetched is kept in the working directory (`lists/`, `coords.json`), so a rerun asks
  the archive only for what is missing. When Wayback keeps refusing a page the crawl stops and
  says so. Wait a while and run the same command again.

### 3. Read the summary

- **`the roster holds N peaks and the spec expects M`**: the list changed, or the archive's copy is
  old. Read the list page (a stale roster, below) before touching `expect`.
- **`no coordinates in the archive for <peak>`**: the archive holds no good capture of that peak's
  page. Report it to the maintainer. **Never guess, approximate or recall a coordinate**: every
  value comes from that peak's own page. With the maintainer's yes, read the page live in their
  Chrome, as for a stale roster: take the `(Dec Deg)` pair from its WGS84 cell, check the page's
  most frequent `pid=` is the peak's, add `"<pid>": [lat, lon]` to `coords.json` and run the same
  command again. 42 of 3,966 peaks needed this on 2026-11-11, most of them recent additions.
- **Many peaks missing at once** is a parser bug, not a thin archive. Stop and read one page by
  hand before running again: check that it answers 200 and contains `WGS84`.

Then spot-check two or three rows against their peak pages by eye. Mount Rainier is
`46.851731, -121.760395`.

### 4. Finish the change

- Credit each new list in `NOTICES.md`, beside the others.
- `presetLists.test.ts` holds the manifest to the CSVs in CI: the schema, unique ids, one CSV per
  entry and one entry per CSV, and each `peaks` against its file's rows. Push and read the checks.

## A stale roster

The archive's copy of a list page can be years old, and a list that is recomputed (an elevation or
prominence list after a new survey) has moved since. `expect` catches it. Read today's roster in
the maintainer's Chrome, which passes the challenge as a person's browser does, and run this on the
list page:

```js
[...document.querySelectorAll('tr')].map((tr) => {
  if (!tr.children.length || !/^\s*[\d.]+\s*$/.test(tr.children[0].textContent)) return null
  const a = tr.querySelector('a[href*="peak.aspx?pid="]')
  return a ? new URL(a.href).searchParams.get('pid') + '|' + a.textContent.trim().replace(/\s+/g, ' ') : null
}).filter(Boolean).join('\n')
```

Save the result beside the spec as `roster<lid>.json`, `{"title": "...", "peaks": [{"pid": "2382",
"name": "Mount Hood"}, ...]}`, and name the file in the list's `roster`. The peaks' coordinates
still come from the archive's peak pages.

## Conventions and gotchas

- **A row counts when its first cell is a rank.** An elevation list also prints the summits that
  miss its prominence rule, with an empty first cell, and they are not on the list (Colorado 13ers:
  629 ranked of 879 rows). A state or county list carries one plain cell, the state or the county,
  between the rank and the peak, and only the first peak link in a row is the row's peak.
  `fetch_list.parse_list` holds all three rules.
- **A summit on a list twice is one row.** One summit tops two counties on most county lists, and
  the roster keeps its first row (Washington: 39 counties, 38 summits).
- **The WGS84 cell has two orderings.** Peak pages give the same point in several notations and
  are not consistent about which comes first:

  ```html
  <td>46.851731, -121.760395 (Dec Deg)<br/>46&deg 51' 6'' N, ...     <!-- Mount Rainier -->
  <td>48&deg 31' 25'' N, ...<br/>48.523611, -120.816193 (Dec Deg)    <!-- Black Peak -->
  ```

  A pattern anchored to the cell's opening matches only the first form and silently drops every
  page of the second, which then look like missing captures. `fetch_coords.parse_coords` takes the
  whole cell and finds the pair tagged `(Dec Deg)` inside it. Test any change against one page of
  each form.
- **A capture can be another peak's page.** Wayback files a capture of `peak.aspx?pid%3D3155`, with
  its `=` escaped, under pid 3155, and peakbagger answered that URL with Mount Rainier. The crawl
  takes a capture only when the pid its page links most often is the pid it asked for
  (`fetch_coords.page_pid`). An Oregon row that landed on Rainier's coordinate found this
  (2026-11-11); the list's `bbox` caught it, and nothing else would have.
- **Rows keep the page's order**, whatever it is: by elevation, by rank, or as a club numbers them.
  Neither number goes into the name.
- **Two peaks of one name are real.** A list can hold two "Granite Mountain" at different
  coordinates. Do not dedupe or rename them: the app keys a row by its coordinate.
- **A famous peak may be absent.** List 5045 ("100 Peaks at Mount Rainier N.P.") does not include
  Mount Rainier. Check the source before "correcting" an omission.
- **Commas in names are safe.** The app's parser splits on the first two commas only.
- Coordinates do not change between captures, so any good capture serves.

## Files

- `scripts/crawl.py`: the one command. Spec in, CSVs and manifest entries out, one summary.
- `scripts/wayback.py`: the one paced connection to the archive, its retries and its index lookup.
- `scripts/fetch_list.py`: a list page, or a roster read live, into the list's peaks in order.
- `scripts/fetch_coords.py`: a peak page into its WGS84 coordinates.
- `scripts/build_csv.py`: the CSV's rows, and the manifest's entry and layout.
- `scripts/verify_csv.py`: a written list checked against its roster and its entry.

All six use the standard library alone, so they need no virtual environment and no install.
