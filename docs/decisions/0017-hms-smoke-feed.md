# 0017. Smoke comes from NOAA's own daily KML, dated in Eastern time

Verbatim guide text at 971fede, copied before the edit to the template.

## From `backend/CLAUDE.md`, line 44

- `app/services/hms.py` — the NOAA HMS smoke snapshot behind `GET /api/smoke` (issue #121). One dated KML per day off NOAA's own file server, not an ArcGIS mirror of the same data — the shared-org-quota failure mode #203 removed from the fire overlay. The date is **Eastern**, because that is the shift the analysts work, and a UTC date would ask for tomorrow's file for five hours every evening; a 404 falls back one day, which is the normal morning state rather than an outage. Density lives in the placemark's `styleUrl` rather than in the data, in a vocabulary NOAA has changed once already (numeric to named, 2022-07-19), so an unrecognized style renders as Light with the raw value kept rather than being dropped. `ospo.noaa.gov/data/land/fire/smoke.kml` is advertised as current and is frozen at 2022-07-18: do not use it
