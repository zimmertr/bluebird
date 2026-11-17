# 0302. A destination's grid square paints its own forecast, and the fetch skips it

- Status: Accepted. Amends [0016](0016-overlays-not-knobs.md) (what the grid's toggle fetches)
- Date: 2026-11-16
- Decider: the maintainer (TJ), 2026-11-16: "Yes, I like that", to painting the squares the destinations stand in from the forecasts the report holds, fetching only the rest, and leaving the hourly budget out of this change
- Issues and PRs: #833
- Cited in code as: #833
- Guide: [`frontend/src/utils/forecastGrid/CLAUDE.md`](../../frontend/src/utils/forecastGrid/CLAUDE.md), the `forecastGridLattice.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useForecastGrid.ts` bullet; [`docs/DATA.md`](../DATA.md), The forecast grid

## Context

The maintainer reported on 2026-10-30, reviewing PR #823, that the forecast grid "almost always just shows" `Forecast grid Waiting 80s` before it draws. The pacer was not at fault. The grid costs more than the analysis leaves behind:

- Each lattice sample is 1.6 weighted calls of weather (16 variables) and 1.0 of cloud (9 variables), both on the forecast host. A full lattice of `MAX_GRID_CELLS = 600` is 1,560 calls, nearly three minutes of the browser's `CLIENT_WEIGHT_PER_MINUTE = 550`, and about a third of the free tier's 5,000 an hour.
- An analysis costs 2.6 calls a destination on the same host, and the grid's first chunk of 150 samples costs 390. Any analysis over about 62 destinations therefore leaves too little of the 60-second window, and the first chunk waits for the analysis's oldest bookings to leave it.
- Open-Meteo's limit is per visitor per host, so the grid cannot have a budget of its own, and the pacer protects the visitor's own quota.

So after a typical analysis, no cut to the lattice gets the first paint under a minute. The only paint that costs nothing comes from forecasts the browser already holds.

## Decision

- **A square a destination stands in paints from that destination's forecast** (`seedCells` in `forecastGridLattice.ts`), the moment the layer is on, and the fetch leaves those squares out, the air quality fetch included.
- **Only a row with a known elevation and an hourly series seeds a square.** A lattice sample is the free air at the ground's height under the square's centre (`terrainElevation`), and a destination's forecast is the free air at its own height, which is the ground's there too, at a point within one pitch of the centre. A row with no elevation was read at the 10 m wind and the 2 m temperature, and one with no series cannot answer the playhead or the arrows. Where several share a square, the one nearest its centre seeds it.
- **The fetch is otherwise unchanged:** the same pacer, the same chunks, the same lattice and pitch, and still keyed on the analysis and never on the ranking (record 0016).
- **The hourly budget is left alone.** Pricing the grid against the 5,000 an hour before it fetches is a separate question.

## Evidence

A virtual-time replay of `WeightedBudget.startFor` with the real constants (550 a minute, batches of 50, a 1.7 s round trip from #545's measurement), and a port of `buildGrid` on the default model's 3 km pitch at the default reach, over six peak lists in `frontend/src/coordinate-lists/`, 2026-11-16. Times are from the analysis landing to the first paint and to the whole grid.

| List | Destinations | Squares | Seeded | First paint before | First paint after | Whole grid before | Whole grid after |
|---|---|---|---|---|---|---|---|
| `wa-snoqualmie-peak-pin` | 20 | 68 | 12 | 3 s | 0 s | 3 s | 3 s |
| `wa-teanaway-twenty` | 20 | 115 | 17 | 3 s | 0 s | 3 s | 3 s |
| `wa-home-court-100` | 100 | 277 | 79 | 60 s | 0 s | 63 s | 63 s |
| `wa-bulger-list` | 100 | 546 | 76 | 60 s | 0 s | 180 s | 127 s |
| `wa-top-200` | 200 | 597 | 136 | 62 s | 0 s | 185 s | 183 s |
| `ca-sierra-peaks-section` | 247 | 540 | 164 | 3 s | 0 s | 125 s | 120 s |

The Sierra list's first paint was already 3 s, because its own analysis overran the minute and waited, so its oldest bookings had left the window by the time it landed. No real Open-Meteo quota was spent.

## Alternatives rejected

- A lower `MAX_GRID_CELLS`: halving it to 300 brings the whole grid in about a minute sooner after a 200-destination analysis, but the first paint still waits about 60 s, and the picture is coarser.
- A smaller first chunk: 50 samples paint at once after a 100-destination analysis, but not after a 200-destination one, which leaves nothing in the minute.
- A coarse lattice first, then the fill: every pass is a request, so the first paint waits just the same, and the whole grid costs more.
- Fewer variables in the grid's request: the pressure levels are what put the grid's wind and temperature at the ground's height, and dropping the cloud request would leave a cloud-deck ranking with no field.
- A budget of the grid's own: Open-Meteo counts per visitor per host, whatever the app does.

## Consequences

The grid paints at once wherever a destination stands, and the squares between fill in as the allowance frees, so the picture starts patchy. After a 200-destination analysis the whole grid still takes about three minutes, and the legend still says `Waiting` with its countdown while the pacer sleeps over a partial field. A marker and its own square now agree by construction, so the model's resolution limit shows between a destination's square and the squares around it rather than under the marker.
