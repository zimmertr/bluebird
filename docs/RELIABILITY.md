# Reliability

I want Bluebird Forecast to work on every analysis, every time, without minutes of retries, and to keep working when a data provider is down for days or weeks. This page is the plan for getting there before 1.0.0: what can fail, how often it actually does, the targets we hold ourselves to, and what keeps an analysis working when something fails.

## Contents

- [Targets](#targets)
- [What Can Fail](#what-can-fail)
- [What the Evidence Shows](#what-the-evidence-shows)
- [The Architecture](#the-architecture)
- [Mitigations](#mitigations)
- [What Waits on Other Repositories](#what-waits-on-other-repositories)

<hr>

## Targets

<hr>

## What Can Fail

An analysis has three stages, and each leans on different things. So I list them by stage, then the page itself, then the overlays, then the platform underneath. "Rides it out" is how long Bluebird Forecast keeps working today while that thing is down. Every row was read from the code on 2026-11-25; the [evidence](#what-the-evidence-shows) section says how often each one actually fails.

### Loading the Page

| Dependency | What you see when it fails | Rides it out today |
|---|---|---|
| The pod, through Cloudflare and the tunnel, serving the page and its assets | Cloudflare's own error page. The app never starts | Not at all. The page is sent `no-cache`, so Cloudflare keeps no copy to serve |
| `GET /api/capabilities` | Nothing said. The model picker falls back to GFS alone and the ring count turns off, for the rest of the session | Silently, with worse limits. It is asked once and never again |
| The OpenFreeMap style, tiles, glyphs and sprites | `The map could not load. Try again later.` and a blank map. You cannot draw a ring, and no marker draws | Not at all. A failed style is asked again only when the browser comes back online, so a tab left open across the outage stays blank until a reload |

### Finding Destinations

| Dependency | What you see when it fails | Rides it out today |
|---|---|---|
| `POST /api/destinations`, answered from the places table | `OpenStreetMap is not available. Try again later.` | The table itself needs no third party, so as long as the pod and the database are up |
| PostgreSQL behind it | Each discovery waits 5 s for a connection, then falls to Overpass | As long as Overpass answers. The pod never notices the database is gone, so every request pays the 5 s again |
| Overpass, the fallback (two donated mirrors) | The same message, after up to 55 s, or 110 s when the mirrors' slots are full | Barely. The two mirrors fail together, and they answer about one request in seven (see the evidence) |
| A pasted list's elevation lookup | Rows keep no elevation and are read at the ground's height | Always. It is best effort |

### Forecasting

| Dependency | What you see when it fails | Rides it out today |
|---|---|---|
| Open-Meteo's forecast host, weather and cloud | A countdown, `Open-Meteo is unavailable · retrying in 20s`, then `Open-Meteo took too long. Try again later.` | Not at all. It is the only weather source, a hung host fails the run after about 160 s, a refusing one after about 60 s, and a 5xx fails it at once with no retry |
| Open-Meteo's archive host, for past windows | The same sentences | Not at all. A window that spans the archive boundary needs both hosts |
| Open-Meteo's air-quality host | The AQI column reads N/A | Always, but a hung host still adds 20 s to every round of four batches |
| Open-Meteo's quota, per visitor's address | `Open-Meteo quota · resuming in 45s`, then `Open-Meteo quota reached. Try again later.` | A minute's limit is waited out. An hour's or a day's fails the run, and everyone behind one address shares it |
| `POST /api/snow-depth` | The snow depth column reads N/A | Always, but the report waits for it, so a pod that hangs holds a finished analysis for up to 110 s |

One more thing makes forecasting fragile: **one failed batch fails the whole analysis.** A 1,500-destination run is 60 forecast requests, and any one of them failing throws away the other 59 (a retry within 15 minutes reuses the ones that landed).

### The Overlays

The wildfire, closure, smoke and fire-activity layers, and the wildfire and closure columns, come from snapshots the pod keeps in the database. So each one rides out its provider for 24 hours, then answers `503` everywhere. Radar, snow depth, relief and imagery come straight from their providers. None of these can fail an analysis, but when one fails the layer just draws nothing, so you cannot tell "no fires" from "the fire feed is down".

### The Platform

| Dependency | What fails with it | Rides it out today |
|---|---|---|
| The home site's power and internet line | Everything | Not at all. There is no second origin |
| The one physical host every node runs on | Everything, and the database's data | Not at all. Three nodes, three app pods and three database instances guard against a VM failing, not the machine |
| The database's data | Discovery falls to Overpass, and the trailhead and crag markers vanish | There is no backup. A rebuild is the planet fill: about 82 minutes plus a 95 GB download, and it only runs weekly unless someone starts it |
| The service mesh's control plane (one replica) | No pod can start while it is down, so nothing else can heal | Running pods keep serving |
| The gateway's certificate | Everything, because the tunnel checks it | About a month of renewal buffer, with nothing to say renewal is failing |
| Prometheus (one instance) | Every release, because the canary gate reads it | Running pods keep serving, but no fix can ship |
| Alerting | Nothing breaks, but nobody is told when anything above does | Every alert goes to a receiver that drops it, and nothing outside the house checks the site |
| GitHub, GHCR and the release token | No fix can ship | Running pods keep serving |

<hr>

## What the Evidence Shows

I measured what I could on 2026-11-25, from production's Prometheus (about 60 days of history), the pods' logs, small live probes of each provider and the project's issues. Every number here is dated, and a new measurement replaces it rather than sitting beside it.

### The Pod Is Not What Fails

Over the 30 days to 2026-11-25 the pod answered no 5xx on any route. Discovery took 19 ms at the median, 98 ms at the 95th percentile and 0.41 s at the 99th. `GET /api/capabilities` took 4 ms, 23 ms and 25 ms. So a run's time and its failures come from the browser's own calls, above all Open-Meteo. However, nothing measures those: **no metric records how a run in the browser ends**, how long it took, or which host failed it. That is the first gap, because the targets below cannot be held without it.

### Open-Meteo's Free Tier Refuses Often

Until 2026-10-27 the release's canary ran one real analysis through the pod, which called Open-Meteo's free tier from the house's one address. Between 2026-09-24 and 2026-10-22 that call answered `502` 96 times out of 101, and the release gate stopped calling Open-Meteo for that reason (#787). On 2026-11-13 `api.open-meteo.com` gave no answer for over a minute while the archive and air-quality hosts answered at once, and every analysis failed, on wifi and on a phone (#934).

### Overpass Answers One Request in Seven

Over 30 days the two Overpass mirrors answered 21 of 152 requests: `overpass-api.de` 2 of 84 (63 timeouts), `maps.mail.ru` 19 of 68. Discovery no longer needs them, since the places table answered every ring in those 30 days, but they are still the fallback when the database cannot answer, and the daily update leans on them.

### The Snapshots Absorb Their Providers

Over 30 days the snapshot refreshes failed 63 times for NIFC, 21 for SNODAS, 21 for the Forest Service closures, 14 for NOAA's smoke and once for FIRMS, against thousands of successes. No reader saw any of it, because each layer served its last good copy. The pods' logs also showed DNS lookups failing inside the cluster now and then (`[Errno -3] Try again`).

### The Providers, Probed

I sent a small sample of requests to each provider from a container at home, the same requests the app makes, a few at a time and two seconds apart. A sample this small says how a provider behaves at that hour, not how often it fails, so the rounds repeat through the night and the table keeps every round.

| Provider | Round at 01:30 on 2026-11-25 |
|---|---|
| Open-Meteo forecast, archive, air quality | 16 of 16 answered; 0.07 s, 0.73 s and 0.69 s at the median |
| OpenFreeMap style and tiles | 12 of 12; 0.08 s |
| Mapterhorn, USGS, EOX tiles | 16 of 16; EOX the slowest at 0.73 s |
| IEM radar, NOAA snow, NOAA smoke | 10 of 10 |
| The two ArcGIS hosts (NIFC, Forest Service) | 6 of 6; 1.1 s and 4.2 s |
| Overpass, both mirrors | 2 of 6; `overpass-api.de` timed out at 30 s and answered `502`, `maps.mail.ru` answered `504` twice |
| bluebirdforecast.com, the page and `/api/capabilities` | 12 of 12; 0.14 s and 0.12 s |

### Nobody Is Told

Prometheus holds 35 rule groups and none of them names a Bluebird Forecast metric, and every alert goes to a receiver that drops it. So the outages above were found by someone using the site.

### The History

| When | What broke | Source |
|---|---|---|
| 2026-07-28 | Discovery waited about 40 s, 30 s of it on a dead Overpass mirror | #177 |
| 2026-07-30 | Discovery `502` from Cloudflare after 85 s | #202 |
| 2026-09-30 | `overpass-api.de` answered under 2.5 s only 38% of the time | #546 |
| 2026-10-07 to 10-21 | The pod's calls to Open-Meteo failed 96 of 101 times | Prometheus, #787 |
| 2026-10-20 | Open-Meteo refused a 262-destination run the pacer thought was under budget | #783 |
| 2026-10-21 | A release aborted because its probe hit Open-Meteo's spent daily quota | #787 |
| 2026-11-13 | `api.open-meteo.com` hung for over a minute and every analysis failed | #934 |

Between 2026-09-25 and 2026-11-25 the release pipeline also failed 5 times in 134, each time at creating the GitHub release or bumping the deployment, and each held production on the previous version until someone re-ran it.

<hr>

## The Architecture

<hr>

## Mitigations

<hr>

## What Waits on Other Repositories
