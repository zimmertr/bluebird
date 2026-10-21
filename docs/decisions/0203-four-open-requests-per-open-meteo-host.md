# 0203. The browser keeps at most four requests open on each Open-Meteo host, and asks once more when one is refused for a sixth

- Status: Accepted
- Date: 2026-10-21
- Decider: the maintainer (TJ), on issue #783, 2026-10-21
- Issues and PRs: #783, #683 (the cloud column on every analysis), #180 and #181 (the pacers), #581 (the sliding window)
- Cited in code as: #783
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the bullet "The browser fetches AQI for the whole field, concurrently with weather" and row 14 of the mirrors table; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `openMeteo.ts` bullet; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/ratelimit/` and `openmeteo_fetch.py` bullets

## Context

On 2026-10-20 the maintainer drew a 1,632 km² ring near Leavenworth. Discovery found 262 destinations, and the forecast fetch failed with `Open-Meteo is rate-limiting. Try again later.` although the pacers believed the run was under budget. `runClientAnalysis` starts the weather, cloud and air-quality fetches together, and each ran four batches at once of its own. Since #683 every analysis fetches the cloud column, so a field over 100 destinations held six or more requests open on `api.open-meteo.com`, and one over 150 held eight. Open-Meteo's source caps the requests one address may have open (`ConcurrencyGroupLimiter.swift`, used by `withFreeApiRateLimiter` in `ApiKeyManager.swift`) and answers the rest with a 429 whose reason names no quota. `classify429` gave that answer no scope, the browser resumed only a minutely 429, and the run failed at once. Records 0004 and 0075 also rested on Open-Meteo metering each service apart, which nothing in the repository had measured.

## Decision

The browser keeps one pool of open requests per host, keyed by the request URL's host, so `api.open-meteo.com`, `archive-api.open-meteo.com` and `air-quality-api.open-meteo.com` are three pools. Each has four slots, `MAX_CONCURRENT_BATCHES`, unchanged. Every request to a host shares its pool: weather, cloud, an archive span on its own host, air quality on its own, and the forecast grid and the model comparison, which call the same three fetch functions. A request books its pacer first, then takes a slot, and gives the slot back once its body is read or the attempt fails, so no pacer sleep and no resume wait holds one. Each fetch still runs its batches through `pooled`, which keeps input order and stops on an abort; the host pool is what bounds the wire.

A 429 whose reason is `Too many concurrent requests` has its own scope, `concurrency`. The request waits one second, abortably and without telling the overlay, then is asked once more with no second pacer booking, because Open-Meteo refused it before counting it. A second refusal fails the request with the existing sentence `Open-Meteo is rate-limiting. Try again later.`. In the browser every request takes that path, air quality's included. No new user-facing string.

The two weighted pacers, `weatherBudget` and `aqiBudget`, stay as they were, now on a measurement.

The pod keeps its two weighted budgets and its two slot budgets. Its `UPSTREAM_CONCURRENCY_WEATHER` slots already serve both its weather and its cloud batches, so one pod stays at four on that host. It reads the same scope: `parse_rate_limit` in `services/errors.py` names it, and `fetch_batched` in `services/openmeteo_fetch.py` resumes it once after a second on every service, whatever `resume_minutely` says, without booking the weight again.

## Evidence

Measured 2026-10-21, 05:00 to 05:02 UTC, with `curl` from the maintainer's home address, the address the failed run used. About 1,000 weighted calls of the day's 10,000.

| Question | Measured | Consequence |
|---|---|---|
| How many requests may one address have open with `api.open-meteo.com`? | Exactly 5. Of 6, 8, 12 and 20 fired at once, 5 answered 200 and every other one answered 429 `Too many concurrent requests` in about 0.7 s, with no `Retry-After` header | The browser's 8 open on that host (4 weather, 4 cloud) lost 3 on every field over 150 destinations |
| Is that cap shared across hosts? | No. 5 forecast, 4 air-quality and 2 archive requests at one instant all answered 200 | A pool per host, not one for everything |
| Is the minute bucket shared across hosts? | No. Twelve 50-location forecast requests passed (600 weighted calls, 05:02:01 to 05:02:21); the 13th answered 429 `Minutely API request limit exceeded`; at that instant one air-quality request and one archive request both answered 200, and a further forecast request answered 429 | The two pacers stay. Under separate buckets the weather host alone takes about 4,460 weighted calls at 16 days, inside the hourly 5,000 |
| Does `callWeight` match Open-Meteo's? | Yes, to the call: the counter refused after 12 × 50 = 600 | Mirror row 7 holds |

Probe 1 fired N requests in parallel at `https://api.open-meteo.com/v1/forecast`, each with 10 locations, `hourly=temperature_2m`, `forecast_days=16` and `models=gfs_seamless` (weight 10 each):

```
N=6   statuses: 5 x 200, 1 x 429
N=8   statuses: 5 x 200, 3 x 429
N=12  statuses: 5 x 200, 7 x 429
N=20  statuses: 5 x 200, 15 x 429
every 429 body: {"reason":"Too many concurrent requests"}, answered in 0.69 to 0.72 s
```

Probe 2A fired, at one instant, 5 of those forecast requests, 4 air-quality requests (10 locations, `hourly=us_aqi`, `forecast_days=5`) and 2 archive requests (1 location, 2 days):

```
wx1..wx5: 200   aq1..aq4: 200   ar1, ar2: 200
```

Probe 2B started one second after a clock-minute boundary, where the counter clears (`minutelyCallback` in `RateLimiter.swift`), and sent 50-location, one-variable, one-day forecast requests one after another (weight 50 each):

```
start 05:02:01
forecast req 13 -> 429 "Minutely API request limit exceeded. Please try again in one minute." after 600 weighted calls, 05:02:21
then at once, 05:02:21:
  air-quality (50 locations, us_aqi, 1 day): 200
  archive (1 location, 1 day):               200
  forecast (control):                        429 Minutely API request limit exceeded
```

Open-Meteo's source, read 2026-10-20: in `withFreeApiRateLimiter` the concurrency check throws before the counter is incremented, so a `Too many concurrent requests` answer costs no quota.

## Alternatives rejected

- Five per host, the measured cap itself. It leaves no room for anything else on the same address and host, such as a second tab or another device behind the same router, and then the next request is the sixth. The slot it would add buys little, because the pacer sets how long a large analysis takes.
- One pool across every host. Each host counts its own five, so one pool of four would hold the air-quality fetch behind the weather and cloud and run in turn what Open-Meteo lets run side by side, which is the overlap record 0004 rests on.
- Fetching the cloud column after the weather (issue #783, option C). It puts the weather host back at four, but the cloud wait would then stack after the weather's, slower than before #683, and nothing would stop the grid or the comparison opening more beside an analysis.

## Consequences

`openMeteo.test.ts` holds the browser's side: the weather and cloud fetches over 300 places never hold more than four open on the forecast host, an air-quality request and a spanning window's archive request each go out while four forecast requests are open, a refusal is asked once more a second later with one pacer booking, a second refusal fails with the rate-limit sentence, a cancel during the wait or while queued for a slot comes through as a cancel and holds no slot, and `resetOpenMeteoState` empties the pools. `test_errors.py`, `test_weather.py` and `test_air_quality.py` hold the pod's: the scope is parsed, resumed once after a second outside the in-flight slot, booked once, and resumed on air quality too. `MAX_CONCURRENT_BATCHES` stays mirror row 14, pinned by `mirrored_constants.json`, and now also sizes each host's pool.

What it costs: the weather and cloud batches take turns on four slots where they ran eight at once, so an analysis too small for the pacer to wait fetches in up to twice as many rounds. Not measured. `runClientAnalysis` starts the weather fetch first, so the weather batches take the first four slots and the progress line moves from the first round; the cloud batches queue behind them. `clientAnalyze.test.ts` holds that order.

Left open: the pod's caps are per pod, so several replicas analyzing at once from one egress address can open more than five on a host. That path serves only an unkeyed API caller, and the maintainer has left it to weigh later. On the pod a concurrency resume asks the whole batch again, so a window spanning the archive boundary repeats both of its requests and books neither. The stream's `error` event can now carry `scope: "concurrency"`, and `bluebird_forecast_openmeteo_rate_limited_total` gains a `concurrency` value on its `scope` label.
