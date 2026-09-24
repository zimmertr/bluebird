# 0056. Cloud base is detected on relative humidity, not on level cloud fraction

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 110

The cloud base detects saturation on relative humidity, and the level cloud fraction must not replace it: Open-Meteo's `cloud_cover_{p}hPa` is a fixed function of that same RH (measured 2026-09-22 on GFS and ECMWF), so it adds variables and no information. `docs/DATA.md` has the variants tested against METARs and why each was declined.
