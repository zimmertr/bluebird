# Decision records

One file for each design decision: what was decided, when, who decided, and the evidence that settled it. A record sits beside the guide paragraph that states the rule today and does not replace it. The guide tells a session what to do. The record keeps why, and since when.

The guide is the `CLAUDE.md` files: [`CLAUDE.md`](../../CLAUDE.md) at the root, [`backend/CLAUDE.md`](../../backend/CLAUDE.md), [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), and one for each of [`utils/`](../../frontend/src/utils/CLAUDE.md), [`components/`](../../frontend/src/components/CLAUDE.md), [`hooks/`](../../frontend/src/hooks/CLAUDE.md) and [`map/`](../../frontend/src/map/CLAUDE.md) under it, and [`frontend/plugins/CLAUDE.md`](../../frontend/plugins/CLAUDE.md) for the build's own plugins. Each guide paragraph that a record explains ends with a link to it.

## Write a record

- Copy [`0000-template.md`](0000-template.md) to `NNNN-slug.md` with the next free number. Numbers have four digits and are never reused. The first batch, 0001 to 0058, is numbered in the order the decisions were made; later records take the next free number whatever their date.
- The title is the decision, as one sentence.
- Take the date and the decider from the guide text when it names them. When it does not, use the merge date and the author of the pull request that shipped the decision, and say that git is the source.
- Give every number the date it was measured. A limit that `GET /api/capabilities` publishes is dated history in a record: say what it was, and point at the endpoint for today's value.
- `Cited in code as` lists the issue and PR numbers that source comments cite for the decision, so a search for `#457` finds the record and the code together. Source comments keep their own provenance.
- Link the record from its guide paragraph as ` Record: [NNNN](path)`, right after the sentence that states the decision. In a paragraph that holds one decision, that is the end of the paragraph. Change nothing else on the line: removing the link must give back the original line byte for byte.

## Supersede a record

A new record that reverses an old one says `Supersedes 00NN` in its status line. The old record changes its status line to `Superseded by 00MM` and nothing else. The guide link moves to the new record in the same pull request. A decision that was reversed before this directory existed has no record of its own: the current record names it under Alternatives rejected.

## Index

| Record | Decision | Date | Status | Guide |
|---|---|---|---|---|
| [0001](0001-alpine-base-image.md) | The image runs on Alpine, not Debian slim | 2026-07-25 | Accepted | Root: Architecture, Stage 2 |
| [0002](0002-weighted-calls-not-requests.md) | Upstream capacity is counted in weighted calls, never in HTTP requests | 2026-07-29 | Accepted | Root: Key constraints |
| [0003](0003-analyze-is-spend-boundary.md) | Analyze is a spend boundary: data knobs wait for it and presentation knobs apply live | 2026-07-29 | Accepted | Root: The interaction model |
| [0004](0004-aqi-eager-in-browser.md) | The browser fetches air quality for the whole field, and the pod fetches it lazily | 2026-07-29 | Accepted | Root: Architecture, step 3; browser AQI bullet |
| [0005](0005-readme-is-an-index.md) | The README is an index and the prose lives in docs/ | 2026-07-29 | Accepted | Root: Documentation |
| [0006](0006-published-limits-at-runtime.md) | The browser reads its limits from /api/capabilities, and its compiled numbers are only fallbacks | 2026-07-31 | Accepted | Root: Key constraints |
| [0007](0007-national-wildfire-snapshot.md) | The pod holds one national wildfire snapshot and filters it per request | 2026-07-31 | Accepted | Backend: `nifc.py` |
| [0008](0008-accent-fill-sky-650.md) | The accent fill is the custom shade sky-650 | 2026-07-31 | Accepted | Root: Style through the design system |
| [0009](0009-no-hue-in-components.md) | No component names a hue | 2026-07-31 | Accepted | Root: Style through the design system |
| [0010](0010-shared-httpx-client.md) | The Open-Meteo services share one HTTP client, and a batch stays at 50 locations | 2026-07-31 | Accepted | Backend: `http.py` |
| [0011](0011-one-union-discovery-query.md) | Discovery sends one Overpass query for every destination type | 2026-07-31 | Accepted | Root: Architecture, step 2 |
| [0012](0012-unnamed-peaks-off-by-default.md) | Unnamed peaks are off by default | 2026-07-31 | Accepted | Root: Architecture, step 2 |
| [0013](0013-accept-edge-not-data-edge.md) | The calendar offers the dates that return data, not every date the API accepts | 2026-08-01 | Accepted | Root: Key constraints |
| [0014](0014-editorial-model-order.md) | Forecast models are listed in an editorial order, and gfs_seamless is the default | 2026-08-01 | Accepted | Root: Key constraints |
| [0015](0015-layer-stacking-order.md) | Stacking order is one named table, LAYER | 2026-08-02 | Accepted | Frontend: `styles.ts` |
| [0016](0016-overlays-not-knobs.md) | A map overlay is never a knob | 2026-08-04 | Accepted | Root: A map overlay is never a knob |
| [0017](0017-hms-smoke-feed.md) | Smoke comes from NOAA's own daily KML, dated in Eastern time | 2026-08-04 | Accepted | Backend: `hms.py` |
| [0018](0018-wind-direction-browser-only.md) | Only the browser fetches the wind direction | 2026-08-04 | Accepted | Root: Key constraints |
| [0019](0019-layers-on-the-map.md) | The overlay switches live in a Layers popover on the map | 2026-08-04 | Accepted | Frontend: `forecastGrid.ts`; "The popover hangs off a button" |
| [0020](0020-fire-warn-10-miles.md) | A destination within 10 miles of an active fire is flagged, and an unchecked one is never shown as clear | 2026-08-17 | Accepted | Frontend: `fireProximity.ts` |
| [0021](0021-browser-path-only.md) | The browser path is the only path for the app | 2026-08-21 | Accepted | Root: The browser path is the only path |
| [0022](0022-wind-at-elevation.md) | Wind is reported at the destination's elevation | 2026-08-21 | Accepted | Root: Key constraints |
| [0023](0023-wildfire-column-toggleable.md) | The wildfire column is on by default and can be hidden | 2026-08-21 | Accepted | Frontend: `fireProximity.ts` |
| [0024](0024-product-rename-in-halves.md) | The product is Bluebird Forecast, renamed in halves | 2026-09-11 | Accepted | Root: The product is Bluebird Forecast |
| [0025](0025-keyed-analyze-api.md) | The analyze routes are public only to a caller with an Open-Meteo key | 2026-09-11 | Accepted | Root: The browser path is the only path |
| [0026](0026-freezing-level-outside-zip.md) | The freezing level is reduced on its own, read in its declared unit, and colored like every metric | 2026-09-13 | Accepted | Root: Key constraints |
| [0027](0027-archive-endpoint-seam.md) | A window older than the forecast data goes to the archive endpoint, split at one seam | 2026-09-13 | Superseded in part by 0072 | Root: Key constraints |
| [0028](0028-notices-below-analyze.md) | Every notice renders in the one block under the Analyze button | 2026-09-13 | Accepted | Root: Every notice renders in the one block |
| [0029](0029-archive-disables-picker.md) | An archive window disables the model picker instead of hiding it | 2026-09-13 | Accepted | Frontend: `ModelPicker.tsx` |
| [0030](0030-tools-own-packages.md) | Tools that need another TypeScript are packages of their own | 2026-09-14 | Accepted | Root: Regenerate the OpenAPI snapshot; Style through the design system |
| [0031](0031-model-picker-listbox.md) | The model picker is a listbox in two parts, one gesture each | 2026-09-14 | Accepted | Frontend: `ModelPicker.tsx` |
| [0032](0032-compare-one-fetch-per-model.md) | A model comparison fetches one request per model, bought at Analyze | 2026-09-14 | Accepted | Frontend: `modelCompare.ts` |
| [0033](0033-compare-encoding.md) | Each compared line wears its own colour and a full name, with no key and no model cap | 2026-09-14 | Accepted | Frontend: `modelCompare.ts` |
| [0034](0034-phone-sheet-on-map.md) | On a phone the results are a sheet standing on the map | 2026-09-14 | Accepted | Frontend: `resultsSheet.ts`; `forecastGrid.ts` |
| [0035](0035-measured-sheet-lift.md) | The sheet lift is measured, not derived | 2026-09-14 | Accepted | Frontend: `forecastGrid.ts` |
| [0036](0036-windy-deeplink-grammar.md) | Windy links follow a grammar measured against the live site | 2026-09-14 | Accepted | Frontend: `windy.ts` |
| [0037](0037-ranking-discards-column-order.md) | A change to Rank by discards the reader's column order | 2026-09-14 | Accepted | Frontend: `tableColumns.ts` |
| [0038](0038-metrics-table-two-blocks.md) | One Metrics table replaces Ranking and Filters, in two blocks with nothing between them | 2026-09-14 | Accepted | Frontend: "The popover hangs off a button" |
| [0039](0039-elevation-band-removed.md) | The app sends no elevation band | 2026-09-14 | Accepted | Root: The app sends no elevation band |
| [0040](0040-control-width-from-metrics-grid.md) | CONTROL_W is 118px, set by the Metrics grid | 2026-09-14 | Accepted | Root: A control sits beside its label |
| [0041](0041-heavy-components-memoized.md) | The three heavy components are memoized | 2026-09-14 | Accepted | Root: The three heavy components are memoized |
| [0042](0042-one-shared-fixture-file.md) | Each shared fixture is one file that both test suites read | 2026-09-17 | Accepted | Root: Keep the vectors and the mirrored constants in lockstep |
| [0043](0043-rule-home-by-what-it-reads.md) | A rule lives where the thing it needs to read is | 2026-09-17 | Accepted | Root: Style through the design system |
| [0044](0044-icon-module-and-ramp.md) | Every glyph comes from one icon module on a four-step ramp | 2026-09-17 | Accepted | Frontend: `icons.tsx` |
| [0045](0045-temp-at-elevation-no-floor.md) | Temperature is reported at the destination's elevation, with no floor | 2026-09-17 | Accepted | Root: Key constraints |
| [0046](0046-snow-layer-export-bounds.md) | The snow depth layer is a bounded ArcGIS export | 2026-09-17 | Accepted | Frontend: `snowDepth.ts` |
| [0047](0047-guide-split-by-directory.md) | The module layouts live in nested guide files beside the code | 2026-09-17 | Accepted | Root: Architecture, module layouts; Documentation |
| [0048](0048-legend-one-box.md) | The map legend is one box, in alphabetical order, anchored at the top | 2026-09-17 | Accepted | Frontend: `forecastGrid.ts` |
| [0049](0049-legend-ticks-no-units.md) | A legend strip prints three ticks and no unit | 2026-09-17 | Accepted | Frontend: `legendRamp.ts` |
| [0050](0050-one-gradient-everywhere.md) | Every scale on the map is drawn as one gradient | 2026-09-22 | Accepted | Frontend: `forecastGrid.ts`; `legendRamp.ts`; "The popover hangs off a button" |
| [0051](0051-no-method-in-headers.md) | Metric column headers do not name the elevation method | 2026-09-22 | Accepted | Root: Key constraints |
| [0052](0052-na-cause-per-metric.md) | One N/A mark, with a cause that differs by metric | 2026-09-22 | Accepted | Frontend: `unavailableCell.ts` |
| [0053](0053-snow-depth-ceiling.md) | A snow depth at the file's ceiling prints as a bound, not a number | 2026-09-22 | Accepted | Frontend: `snowCeiling.ts` |
| [0054](0054-snodas-snow-depth.md) | Snow depth comes from one national SNODAS grid the pod holds | 2026-09-22 | Accepted | Backend: `snodas.py` |
| [0055](0055-app-split-by-concern.md) | App.tsx and MapView.tsx are split into modules by concern | 2026-09-22 | Accepted | Frontend: `MapView.tsx`; the hooks cut out of `App.tsx` |
| [0056](0056-cloud-base-from-rh.md) | Cloud base is detected on relative humidity, not on level cloud fraction | 2026-09-23 | Accepted | Root: The Python and TypeScript mirrors |
| [0057](0057-cloud-fetched-on-request.md) | The cloud column is fetched only when a ranking or a bound names it | 2026-09-23 | Accepted | Root: The cloud column |
| [0058](0058-compare-reach-and-mark.md) | A compared line runs to its own model's reach, with one mark per short row | 2026-09-23 | Accepted | Frontend: `modelCompare.ts` |
| [0059](0059-not-found-page-no-explanation.md) | The 404 page explains nothing | 2026-07-28 | Accepted | Frontend: `NotFoundPage.tsx` |
| [0060](0060-overlay-reassurance-tiers.md) | The discovery wait is narrated in tiers set by measured mirror times, with no promised ceiling | 2026-07-29 | Accepted | Frontend: `analyzeOverlay.ts` |
| [0061](0061-custom-match-radius-150m.md) | A pasted coordinate takes the elevation of the peak within 150 m | 2026-07-30 | Accepted | Backend: `app/services/osm/` |
| [0062](0062-analyze-blockers-every-reason.md) | Analyze names every reason it is blocked, not the first | 2026-07-31 | Accepted | Frontend: `analyzeGate.ts` |
| [0063](0063-smoke-no-bbox.md) | The smoke endpoint answers for all of North America, with no bbox | 2026-08-04 | Accepted | Backend: `routes/smoke.py` |
| [0064](0064-tooltips-and-strings-need-approval.md) | A tooltip or a user-facing string needs the maintainer's approval | 2026-08-05 | Accepted | Root: Style through the design system |
| [0065](0065-link-carries-camera-removals-order.md) | The share link carries the map camera, the removed rows and the table's header sort | 2026-08-22 | Accepted | Frontend: `urlParams.ts`; `mapView.ts` |
| [0066](0066-tutorial-points-and-never-acts.md) | The tutorial points at controls and never acts on them | 2026-09-29 | Accepted | Frontend: `src/tour/`; `tourSteps.ts` |
| [0067](0067-region-6-closure-orders.md) | The pod holds one Region 6 closure snapshot and filters it by bbox and kind | 2026-09-30 | Accepted | Backend: `usfs_closures.py` |
| [0068](0068-forest-orders-entry-closure-test.md) | A Region 3 or 4 forest order is an area closure when its citation or its text closes the area to entry, and closure coverage is per kind | 2026-09-30 | Superseded in part by 0079 | Backend: `usfs_closures.py`; `usfs_coverage.py` |
| [0069](0069-color-scales-not-rederived-for-cvd.md) | The metric colour scales are not re-derived for colour vision deficiency | 2026-08-07 | Accepted | Frontend: `colors.ts` |
| [0070](0070-table-rank-is-the-ranking.md) | The table's # and the CSV's Rank keep the ranking's rank after a header sort | 2026-10-01 | Accepted | Frontend: `useTableView.ts` |
| [0071](0071-analyze-frames-rows-off-screen.md) | A committed report moves the map only when none of its rows is in view | 2026-10-01 | Accepted | Frontend: `mapFraming.ts` |
| [0072](0072-browser-joins-spans-at-local-midnight.md) | The browser joins a spanning window's two fetches at the reader's local midnight, not at the UTC boundary | 2026-10-01 | Accepted | Root: Key constraints; mirror row 11 |
| [0073](0073-click-reads-tile-feet.md) | A clicked summit takes its elevation from the tile's own feet | 2026-10-01 | Accepted | Frontend: `basemapPoi.ts` |
| [0074](0074-refuse-what-the-pacer-would-shed.md) | An unkeyed analysis that its own batches would shed is refused before it spends | 2026-10-01 | Accepted | Backend: `routes/analyze/phases.py` |
| [0075](0075-pacer-sliding-window.md) | The weighted pacer spends at most its budget in any 60 seconds, as a sliding-window log | 2026-10-01 | Accepted | Backend: `app/ratelimit/`; Frontend: `openMeteo.ts` |
| [0076](0076-api-semver-strict-reader.md) | SemVer 1.0 covers the HTTP API and share links, and a request body refuses a field it does not declare | 2026-10-01 | Accepted | Root: Regenerate the OpenAPI snapshot |
| [0077](0077-snapshot-max-stale-24h.md) | An overlay snapshot is served through failed refreshes for 24 hours, and no longer | 2026-10-01 | Accepted | Backend: `app/services/snapshot.py` |
| [0078](0078-timestamp-offsets-honored.md) | A request timestamp means the instant it names: an offset is converted to UTC, and a naive stamp is read as UTC | 2026-10-01 | Accepted | Backend: `app/models/` |
| [0079](0079-forest-order-vetoes-and-start-date.md) | A Region 3 or 4 order's own words can veto its citation, a short list excludes what no words can, and an order that has not started is not live, and a Stage 3 fire closure counts by its type | 2026-10-01 | Accepted | Backend: `usfs_closures.py` |
| [0080](0080-major-from-the-title-only.md) | A major version comes from the PR title's `!` alone, and a body footer never counts | 2026-10-01 | Accepted | Root: CI/CD pipeline; `docs/CICD.md` Conventions |
| [0081](0081-edge-404-is-the-apps.md) | The gateway's 404 is the app's, and a keyed route's CORS preflight reaches the pod | 2026-10-01 | Accepted | Backend: `routes/notfound.py`; `scripts/generate_edge_not_found.py` |
| [0083](0083-fix-forward-no-hand-deploy.md) | A bad release is fixed forward, and the pipeline is the only supported way to deploy | 2026-10-01 | Accepted | Root: Kubernetes deployment |
| [0084](0084-hsts-at-the-edge-six-months.md) | The Cloudflare zone redirects HTTP and sends HSTS for six months, with no subdomains and no preload | 2026-10-01 | Accepted | Backend: `app/security_headers.py` |
| [0085](0085-chart-stays-gpl.md) | The Helm chart stays GPL-3.0-only as a separate work, and says the image it installs is noncommercial | 2026-10-01 | Accepted | Root: Kubernetes deployment |
| [0086](0086-license-notices-built-into-the-image.md) | The image builds its own third-party license file from what it ships, and a package with no text fails the build | 2026-10-01 | Accepted | Root: Architecture; Frontend: `plugins/thirdPartyLicenses.ts`; Backend: `scripts/write_third_party_licenses.py` |
| [0087](0087-stale-tab-reloads-once.md) | A tab left open across a release reloads itself once, silently, and at most once per build | 2026-10-01 | Accepted | Frontend: `src/staleChunk.ts` |
| [0088](0088-commit-closes-every-popup.md) | A committed report closes every popup on the map, pinned ones included, and the forecast player is an overlay a popup avoids | 2026-10-01 | Accepted | Frontend: `hooks/useClosePopupsOnCommit.ts` |
| [0089](0089-focus-follows-the-replacement.md) | The keyboard goes where the pressed control went: into a popover, back to its trigger, and to whatever replaces a control that leaves | 2026-10-01 | Accepted | Frontend: `hooks/useFocusHandoff.ts`, `hooks/usePopover.ts` |
| [0090](0090-named-by-the-words-it-shows.md) | A control is named by the words it shows, and a sentence about where it goes is its description | 2026-10-01 | Accepted | Frontend: `components/ResultsTableRow.tsx` |
| [0091](0091-rank-digit-stays-plain-white.md) | The marker's rank digit stays plain white, with no halo | 2026-10-01 | Accepted | `docs/STYLES.md` |
| [0092](0092-closure-dash-is-no-order-found.md) | The Closure dash means "no Forest Service order found", and the N/A hover names no place | 2026-10-01 | Accepted | Frontend: `utils/closureProximity.ts` |
| [0093](0093-uncommitted-run-changes-nothing.md) | A run that does not finish changes nothing: a cancel or a failure puts the previous report back exactly | 2026-10-01 | Accepted | Root: Architecture; Frontend: `hooks/useAnalysisReport.ts`, `hooks/useAnalyzeCommand.ts` |
| [0095](0095-forecast-snapshot-carries-its-build.md) | The stored forecasts carry the build that wrote them, and only that build reads them back | 2026-10-01 | Accepted | Root: Architecture; Frontend: `utils/forecastStore.ts` |
| [0096](0096-encoded-slash-refused-at-both-layers.md) | A path that spells a slash as `%2F` gets the edge's 404, from the gateway and from the pod | 2026-10-06 | Accepted | Backend: `app/main.py` |
| [0097](0097-request-size-bounds.md) | A request body is capped by size before it is read, every request list has a maximum, and a ring's point cap is published | 2026-10-06 | Accepted | Root: Key constraints; mirror row 30; Backend: `app/body_limit.py` |
| [0098](0098-destination-hour-budget.md) | An analysis is bounded by candidates times window hours, keyed or not, and the forecast cache by bytes | 2026-10-06 | Accepted | Backend: `limits.py`, `routes/analyze/phases.py`, `services/cache.py` |
| [0099](0099-locked-installs-no-install-scripts.md) | The backend installs from a hashed pip-compile lock, no `npm ci` runs install scripts, and npm and pip updates wait seven days | 2026-10-06 | Accepted | Root: Development commands |
| [0102](0102-one-redacting-log-formatter.md) | Every log record passes one root formatter that masks a caller's key and escapes control characters, traceback included | 2026-10-06 | Accepted | Root: Architecture; Backend: `app/log_redaction.py` |
