# 0004. The browser fetches air quality for the whole field, and the pod fetches it lazily

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 123

3. Fetches hourly weather from Open-Meteo in batches of 50 (at most 4 in flight), **paced under weighted-call budgets** — Open-Meteo bills per location, not per request (`services/openmeteo_weight.py`); results are cached ~15 minutes per location+window (`services/cache.py`). **On this path** US AQI is fetched **lazily**: for the displayed rows only, unless `sort_by` is an AQI key, because the budget here is the pod's and shared across visitors. The browser path deliberately does the opposite — see the interaction model below. Either way AQI is best-effort: failures and the short horizon degrade to `null` AQI, never fail the analysis (weather forecasts reach ~16 days, air quality only ~5). Upstream 429s are parsed (minutely resumes automatically; hourly/daily stop honestly)

## From `CLAUDE.md`, line 136

- **The browser fetches AQI for the whole field, concurrently with weather** — the opposite of the server path above, and deliberately so. Open-Meteo bills weighted calls *per service*, so air quality spends a per-visitor quota the weather fetch cannot touch, and overlapping the two costs no extra wall clock. That is what makes an AQI ranking a presentation knob rather than another Analyze.
