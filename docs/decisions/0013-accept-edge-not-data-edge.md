# 0013. The calendar offers the dates that return data, not every date the API accepts

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

`FUTURE_LIMIT_DAYS` in `frontend/src/utils/calendar.ts` is deliberately **not** this pattern, and is the one limit nothing publishes. It is Open-Meteo's real edge, measured rather than read off the docs, and the measurement that matters is that **the range of dates the API accepts is not the range it has data for**. `FUTURE_LIMIT_DAYS = 15` is the accept edge forward, because "16 days" counts today and today + 16 is a 400. `PAST_DATA_DAYS` (in `forecastWindow.ts`, mirroring `limits.py`) is *not* the accept edge back (that is 93): past ~58 days every model answers 200 with an hourly array of nulls, which is why the calendar used to offer ~30 days of history that could only ever come back empty (#230).

## From `CLAUDE.md`, line 138

`bandEnd` then walks back one further day wherever a local 23:59 falls on the next UTC date, since every fetch sends UTC hour stamps and the API states its far limit as a UTC date — so the far edge is genuinely zone-dependent. The backend's `PAST_LIMIT_SLACK_DAYS`/`FUTURE_LIMIT_SLACK_DAYS` are a looser backstop so a direct API caller near the boundary is not falsely rejected; pointing the calendar at those would offer days that come back empty, and pointing it at the advertised one-year / ~16-day figures would offer days that 400. They are published as `limits.max_past_days`/`limits.max_future_days`, and since #393 `resolveWindow` refuses a window against the DEPLOYMENT's pair rather than a compiled copy of the default one.
