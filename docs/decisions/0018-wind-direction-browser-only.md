# 0018. Only the browser fetches the wind direction

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

The wind bearing the map's playback arrows read is deliberately **not** a tenth: `wind_direction_10m` joins the browser's hourly fetch only, riding `HourlySeries` as an optional client-populated field the way `series_times` does, because nothing the backend computes uses it and adding it to `weatherSeries` would be a semantic change to a shared aggregation pinned byte-for-byte by `weather_vectors.json` — for the sake of a picture. It costs nothing either: the weight factor is `max(1, vars × models / 10)`, and the bearing is one variable inside a request that carries fifteen from the browser and fourteen from the pod.
