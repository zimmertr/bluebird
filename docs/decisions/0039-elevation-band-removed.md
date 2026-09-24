# 0039. The app sends no elevation band

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 133

- **The app sends no elevation band.** The panel's elevation min/max filter was removed in #341 because it was little used and its placement fought the Metrics table. `min_elevation_ft`/`max_elevation_ft` remain on `POST /api/analyze` and `POST /api/destinations` for API callers, an old share link's `minel`/`maxel` simply parse to nothing, and the browser path analyzes whatever the ring finds.
