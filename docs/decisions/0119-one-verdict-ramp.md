# 0119. A metric with a good end and a bad end wears one verdict ramp, the US EPA's six AQI colours, and temperature, the freezing level and snow depth are the recorded exceptions

- Status: Accepted. Amends 0113 (its colour sentence: the cloud deck leaves the freezing level's height ramp for the verdict ramp reversed).
- Date: 2026-10-07
- Decider: TJ, on #510 (2026-10-07)
- Issues and PRs: #510, #445, #295, #449, #117, #670, #672
- Cited in code as: #510
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `colors.ts` bullet

## Context

#510 (2026-09-23) found the metric scales in `colors.ts` using four colour schemes. Precipitation and wind ran green, lime, yellow, orange, red and purple; air quality ran the EPA's green, yellow, orange, red, purple and maroon; temperature ran cold to hot with green in the middle; and the freezing level, snow depth and the cloud deck (after #672) wore cold height ramps that give no verdict. The cloud deck has a good end for every reader of this app, and its ramp did not say which it was. Two near-identical verdict ramps, one with lime and one with maroon, also meant purple sat one band from the top on one scale and at the top on the others.

## Decision

A family with an obvious good end and an obvious bad end wears `VERDICT_RAMP` in `frontend/src/utils/colors.ts`: `#22c55e`, `#eab308`, `#f97316`, `#ef4444`, `#a855f7`, `#991b1b`, which are the US EPA's six AQI categories (Good, Moderate, Unhealthy for Sensitive Groups, Unhealthy, Very Unhealthy, Hazardous) in the hues the AQI scale has worn since #445. A family whose good end is the high one wears `VERDICT_RAMP_REVERSED`. Precipitation (the window total and the rainfall-rate scale), wind and air quality wear the ramp; the cloud deck wears it reversed. No thresholds change.

Three families are exceptions, each with its reason on its own entry:

- Temperature: a verdict with a bad end on both sides, so its green is in the middle. Its green is the ramp's green and its warm half is the ramp's orange and red.
- The freezing level: sport specific. A skier wants a low freezing line and a climber on wet rock fears one (settled 2026-09-14, when #295's exclusion was reversed).
- Snow depth: sport specific on the same argument. Deep snow is what a skier drove out for and what stops a scrambler at the trailhead. TJ kept it an exception on 2026-10-07.

A new family takes `VERDICT_RAMP`, or its reverse when high is good, unless it is added to that list with its reason on its entry and a record that says why.

Lime leaves the app's scales. The EPA has six categories and every scale has six bands (`scaleTicks` in `legendRamp.ts` reads the count, and its three tick positions were measured for six), so a ramp that kept lime and added maroon would need a seventh band and a seventh AQI category that does not exist.

The cloud deck's ramp runs maroon at or below 3,000 ft, purple to 6,000, red to 9,000, orange to 12,000, yellow to 15,000 and green above, and a dry column (`CLOUD_DECK_CEILING_FT`) reads green. Green is at the top because a high deck or a dry column is a clear summit for every reader of this app. The low end is a bet: the deck is the base of the lowest cloud, not its top, so a deck on the valley floor under a high summit is read as the summit in cloud rather than as an undercast the summit stands above. That is the hiker's reading, chosen over the photographer's.

This does not reopen record 0069: the scales are still not re-derived for colour vision deficiency.

## Evidence

- Measured 2026-10-07 in `colors.test.ts`, which recomputes every number from the constants. Cell text is the shade over its own 20 % tint on slate-800 (`#1d293d`), the ring is the shade against the marker's white stroke, and the swatch is the shade on slate-800:

  | Shade | Cell text | Marker ring | Legend swatch |
  |---|---|---|---|
  | Green `#22c55e` | 4.46 | 2.28 | 6.41 |
  | Yellow `#eab308` | 5.07 | 1.92 | 7.62 |
  | Orange `#f97316` | 3.94 | 2.80 | 5.21 |
  | Red `#ef4444` | 3.23 | 3.76 | 3.88 |
  | Purple `#a855f7` | 2.94 | 3.96 | 3.69 |
  | Maroon `#991b1b` | 1.70 | 8.31 | 1.76 |

  Yellow alone clears 4.5:1 as cell text. Green, orange, red and purple miss it, as they did on #445. Maroon misses it badly, and its swatch misses even the 3:1 a non-text mark owes. All of that is the state the AQI scale has been in since #445; this change carries it to the top band of four scales rather than one.
- The band shift. Thresholds are unchanged, so on precipitation and wind every band moves one step along the ramp: what was lime is yellow, what was yellow is orange, and so on, and maroon appears above the last threshold (above 1.00 in over a window, above 1.00 in/hr, above 50 mph) where purple was.

## Alternatives rejected

- A seven-band ramp that kept lime and added maroon: it needs a seventh AQI category that does not exist, and it moves the legend's three ticks, which are measured for six bands.
- Moving snow depth or the freezing level onto the verdict ramp: either direction picks one sport's reading over another's. The freezing level was settled on 2026-09-14 and TJ kept snow depth out on 2026-10-07.
- Keeping the cloud deck on the freezing level's height ramp (record 0113, #117): it gives no verdict for a metric that has one for this app's reader. #117 chose it on the photographer's reading, where a low deck can be the undercast someone drove up for.

## Consequences

`colors.test.ts` holds the rule: every family in `METRIC_SCALE` wears `VERDICT_RAMP` or `VERDICT_RAMP_REVERSED`, or is in the test's exceptions list (`temp`, `freeze`, `snow`), and a family in that list that moved onto the ramp fails too. The test also holds the ramp to the AQI scale's colours and thresholds and pins the contrast table above. The cost is the contrast: maroon's 1.70:1 as cell text, which used to be reached only by an AQI above 300, is now reached by a washout, a 50 mph wind and a deck on the valley floor. `docs/USAGE.md` describes every ramp as shipped.
