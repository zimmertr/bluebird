# 0237. Fire activity is a pod snapshot of FIRMS's keyless files, coloured by age in the browser

- Status: Accepted
- Date: 2026-10-27
- Decider: the maintainer (TJ), on issue #799, 2026-10-27: a layer like CalTopo's Fire Activity, labelled `Fire activity`, carrying VIIRS (NOAA-20 and NOAA-21) and MODIS and not GOES, keyed in three age bands, `Under 12 hours`, `12 to 24 hours` and `24 to 48 hours`, with nothing older than 48 hours drawn. On 2026-10-28, reviewing the pull request, the maintainer made the key one line like Smoke's, three starburst chips reading `12h`, `24h` and `48h`, and the detections starbursts on the map like CalTopo's. Reading FIRMS's global files rather than the regional ones, holding them as columns, sending an instant rather than an age, and the band colours are Claude's, building #799, for the maintainer's review on the pull request.
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/fire_activity.py` and `app/routes/fire_activity.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `fireActivity.ts` bullet; [`docs/DATA.md`](../DATA.md#fire-activity)
- Related: 0182 (one pod refreshes each overlay snapshot into the shared cache), 0077 (a snapshot is served for 24 hours through failed refreshes), 0007 (one national wildfire snapshot, filtered per request), 0016 (an overlay is never a knob)

## Context

The wildfire perimeters say where a fire's surveyed edge was, in the United States, often days ago. They say nothing about what burned this morning, or anywhere else. Satellites see hot pixels twice a day everywhere, and CalTopo draws them as its Fire Activity layer. The maintainer asked for the same on 2026-10-27.

## Decision

**The pod reads NASA FIRMS's keyless active fire files and serves a box's slice.** `GET /api/fire-activity?bbox=` answers GeoJSON points, worldwide, from the Global 48-hour CSVs for NOAA-20 and NOAA-21 (VIIRS) and MODIS, fetched together every 60 minutes, FIRMS's own cadence, all three or none. It rides the shared snapshot pattern (0182) and its 24 hours (0077), as row `fire_activity`. Every detection keeps its position, `acquired` (ISO 8601 UTC), instrument, satellite and confidence as FIRMS spells them, and FRP. Nothing is dropped for its confidence.

**The pod holds the detections as columns, sorted into 1° cells**, and writes a box's text per request.

**The answer carries an instant, and the browser colours by age.** `utils/fireActivity.ts` puts each detection in a band against the browser's clock, under 12 hours, 12 to 24 or 24 to 48, each band holding its lower edge, and drops it past 48 hours. The map layer reads the bands again every minute and repaints only when one moved. Red, orange and yellow, newest first, each disc in a near-black stroke.

**The legend keys the bands on one line**, `Fire activity (FIRMS)` and three chips on its right where Smoke has its `L`, `M` and `H`: a 12-point starburst per band, in the band's fill and the layer's edge, with the hour the band ends at inside it, `12h`, `24h` and `48h` (`SWATCH_STAR`). The label is the smoke chips' glyph, 10px slate-900, which clears 4.5:1 on all three fills, so one ink serves every chip and the red keeps its colour. The star is 24px, because the label has to sit inside its inner corners to stand on the fill.

## Evidence

Measured 2026-10-27:

- The three Global 48-hour files were 13.3 MB (NOAA-20), 12.5 MB (NOAA-21) and 1.8 MB (MODIS), 27.7 MB together, each downloaded in about 2.5 s. They held 334,585 rows, 198,575 of them inside 48 hours; the oldest row in a "48h" file was 74 hours old.
- In the backend's image: the three files parsed in 1.16 s and sorted into cells in 0.33 s. The kept snapshot packs to a 1.8 MB row and unpacks in 85 ms. Formatting a box took 2 ms for the western United States at zoom 5 (2,406 detections), 48 ms for southern Africa at zoom 6 (55,563, 11.2 MB of JSON, 0.74 MB gzipped), and 187 ms for the world (198,575, 40.2 MB, 2.65 MB gzipped).
- The fills against Liberty's land (`#efece6`) and dark forest (`#2c4844`, the mean of a USGS imagery tile over the Oregon Cascades at zoom 13): `#ff5a45` 3.21:1 on the forest, `#fb923c` 4.38:1, `#fde047` 7.52:1; the stroke `#1c1917` 14.83:1 on Liberty and 1.76:1 on the forest. Red-500 (`#ef4444`) measured 2.64:1 on the forest. `fireActivity.test.ts` holds every number.
- The legend chips' label, slate-900 (#0f172b), measured 2026-10-28 on each fill: 5.77:1 on `#ff5a45`, 7.88:1 on `#fb923c` and 13.53:1 on `#fde047`. `styles.test.ts` holds them.

## Alternatives rejected

- **FIRMS's area API.** It needs a MAP_KEY and meters transactions per key, so a key would be one more secret and one more quota for the deployment, for the same detections the files carry.
- **NASA GIBS's FIRMS imagery.** Rendered tiles carry no acquisition time, so the browser could not colour by age or let a detection change band while the map is open, and their colours are GIBS's.
- **Esri's Living Atlas feeds of the same detections.** An ArcGIS quota shared with every other consumer, the failure 0007 moved the perimeters off.
- **The regional files.** North America and Europe would have needed an outline on `/api/capabilities` and a greyed Layers row elsewhere. The global set is small enough to hold.
- **GOES.** 2 km pixels every few minutes from geostationary orbit, a different and much noisier picture. The maintainer left it out.
- **Suomi NPP's VIIRS file.** Its feed ends on 2026-11-02.
- **The key as a row per band**, the layer's name over `Under 12 hours`, `12 to 24 hours` and `24 to 48 hours` each beside its disc, as first built: four lines where the smoke key, which also keys three classes, takes one (the maintainer, 2026-10-28).
- **A light label on the red chip and a dark one on the other two.** The dark ink clears the red at 5.77:1, so one ink does.
- **An age in the answer.** It would be wrong a minute after it was sent, and a stale snapshot would make it wronger.
- **Feature text held per detection, as the perimeters are.** About 45 MB for 200,000 points, against about 7 MB of columns, with a box costing milliseconds to format either way.

## Consequences

The pod downloads about 28 MB an hour from FIRMS, once for the deployment while the database is up. The route needs the chart to list `/api/fire-activity` in `ingress.publicApiPrefixes`; until it does, the public site answers the edge's `404` and the layer stays empty. A detection is about 3 hours behind its pass, and the newest band covers 12 hours of them, so the layer reads as recent heat rather than as a live fire line. If FIRMS stops publishing one of the three files, the refresh fails and the last good snapshot ages out after a day; the loss shows in `bluebird_forecast_snapshot_refresh_failures_total` under the `NASA FIRMS (fire detections)` provider.
