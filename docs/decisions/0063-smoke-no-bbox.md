# 0063. The smoke endpoint answers for all of North America, with no bbox

Verbatim guide text at 971fede, copied before the edit to the template.

## From `backend/CLAUDE.md`, line 29

- `app/routes/smoke.py` — `GET /api/smoke`: NOAA HMS smoke plumes for the whole of North America, with no bbox parameter, because a busy day measured under half a megabyte and a filter would be ceremony where NIFC's 16.5 MB genuinely needed one. `analysis_date` rides as a foreign member beside `fetched_at`: HMS publishes one dated file per day and the first analyst pass lands around late morning Eastern, so before then the fetch falls back to yesterday and that field is the only thing that says so
