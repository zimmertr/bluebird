# 0057. The cloud column is fetched only when a ranking or a bound names it

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 130

- **The cloud column is the one presentation knob that can spend** (#117). Cloud base and cloud cover need a second Open-Meteo request per location (twelve variables, weight 1.2 on the weather budget), so the browser fetches them only when the ranking or a bound names a cloud family at Analyze time (`namesOnRequestMetric`), and `HOURLY_VARIABLES` does not carry them. The snapshot records `cloudFetched`; picking a cloud ranking or typing a cloud bound over a report without it raises `cloud-needed`, last in the `commitNeeded` order because any other cue's Analyze fetches the column too. A report carries the column for every row or none (`withCloud` strips it from held rows a new report did not ask for), its six table columns are hidden unless it is held or ranked, and the forecast grid fetches it only when the snapshot says so. The server path mirrors lazy AQI: a cloud `sort_by` or bound fetches it for every candidate, and `include_clouds` alone fetches it for the returned rows.
