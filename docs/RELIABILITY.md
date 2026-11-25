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

The bar is that Bluebird Forecast works the way a search engine does: you press the button, you get the answer, and you never think about whether it will work. So each target names something you do, the share of attempts that must succeed, and how long success may take, over a rolling 28 days. A run that succeeds after a minute of countdowns counts as a failure, because that is not what you asked for.

| What you do | Succeeds | Within | Measured by |
|---|---|---|---|
| **Open the Site** - the map is up and you can draw | 99.95% of loads (about 20 minutes a month) | 3 s at the 95th percentile | An outside probe of the page, and the browser's own report of the map loading |
| **Run an Analysis** - press Forecast and get a ranked table | 99.9% of runs that pass the button's checks (one in a thousand) | 8 s at the 95th percentile and 20 s at the 99th for up to 200 destinations over 3 days; 45 s at the 95th percentile at the cap (1,500 destinations, 16 days) | The browser's report of each run's outcome and duration |
| **Open a Shared Link** - the link's analysis runs on open | The same as running an analysis | The same | The same report |
| **Read the Overlays** - wildfires, closures, smoke, radar, snow | Not counted against the budget | Each layer says when it is unavailable or older than a day, rather than drawing nothing | The browser's report of each layer's failures |

Two more targets are not percentages, because no amount of retrying meets them:

- **No Outage of One Provider Stops an Analysis** - however long it lasts. Every dependency on the path from opening the site to a ranked table has a second source that does not fail with the first, so a provider that is down for a week costs you nothing but a slower fallback.
- **Nothing Is Lost for Good** - the database can be put back from a backup within an hour, and nothing about the site needs one machine or one house to keep running.

### How I Got These Numbers

The pod already answers well inside them: no 5xx in 30 days and discovery at 0.41 s at the 99th percentile. A healthy 200-destination run takes 4 to 6 s (520 weighted calls, eight requests through four open requests, measured batches of 1.5 to 1.8 s). So the latency targets leave room for one fallback per run and nothing more. The cap's 45 s is what 60 requests take without the free tier's minute-by-minute pacing, which is what owning the weather service removes; on the free tier alone the same run takes 7 to 8 minutes of pacing by design.

The 99.9% is one failed run in a thousand. Today one weather provider sits alone on that path, and in the 30 days before 2026-11-25 it was out for minutes at a time at least once, so the target cannot be met by retrying it harder. It can be met by having two.

### The Error Budget

A target with no consequence is a wish. So while a 28-day window has spent more than its budget, the next change to ship is a reliability fix, and new features wait. Each target's burn is an alert (see [Alerting](#alerting)), so nobody has to go looking.

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

The rule is short: **nothing on the path from opening the site to a ranked table depends on one thing.** Every dependency is either owned (it runs on our machines or its data is copied into our database) or paired with a second source that fails for different reasons. Bluebird Forecast already did this twice. The places table replaced Overpass for discovery (#760), and the snapshots in the database let the overlays ride out their providers for a day (record 0182). So this plan does the same for everything that is left.

### Weather: Our Own Open-Meteo, Then Theirs

Open-Meteo's server is open source, and every model it serves is published to a public bucket on AWS that anyone can read without an account. So we can run the same server, with the same model data, and it gives the same numbers. That answers the reason #934 gave for refusing a second provider: a different provider's numbers would disagree with the ones the table ranks on, but our copy of Open-Meteo's numbers cannot.

The browser then asks two places for every batch:

1. **Our mirror first**, published through the tunnel on its own hostname. It has no quota, so a large run is no longer paced for minutes.
2. **Open-Meteo's public hosts** when the mirror does not answer quickly, fails, or is unreachable. If the first answer has not arrived within about 3 s (a healthy 50-location batch takes 1.5 to 1.8 s), the browser sends the same batch to the second source and takes whichever answers first. So a slow or dead source costs a few seconds, not a countdown.

The two fail for different reasons. Our mirror fails when the house does, and Open-Meteo's hosts fail when theirs do, so both being down at once is rare. When the house is down the page still loads from Cloudflare's copy (below), and the browser goes straight to Open-Meteo.

What it costs, measured on 2026-11-25 from the public bucket. The files a mirror must hold to serve the app's window (about 58 days back plus each model's reach ahead) come to roughly 350 GB for all eight models in the picker, plus about 2.5 GB for air quality and about 15 GB a year for the archive's surface fields. The three models most runs use (GFS with HRRR, ECMWF and ICON) are about 140 GB of that. These figures come from sizing four variables per model and scaling to the 25 the app asks for, so they could be off by half either way. The mirror syncs each model as it updates, every one to six hours, and Open-Meteo's server is AGPL, so the deployment links to its source.

A third source is possible: Open-Meteo's paid API. A key cannot sit in the browser, but a small Cloudflare Worker could hold it and pass requests through, which keeps it off the house's connection too. It costs about $29 a month for a million calls. I'd hold it in reserve rather than build it, since the mirror and the public hosts already fail separately.

### The Page: Served From Cloudflare's Copy

Today Cloudflare keeps no copy of the page, so the house going offline shows its error page, even though the analysis itself runs in your browser. Two changes fix that:

- **The page is cached at the edge** and served stale while the house is unreachable. The hashed assets already are. The page itself needs a cache rule in the Cloudflare zone and `stale-while-revalidate` on the page, so a visitor during an outage gets yesterday's copy, which is as good as today's. Cloudflare documents serving a cached copy when the origin answers 5xx or cannot be reached; that has to be tested before anyone relies on it.
- **A service worker keeps the page for returning visitors**, with the last published limits and model list. So someone who has used the site once can open it with the house unplugged.

### Finding Destinations Without the House

The places table lives in the house. So while the house is down, a ring finds nothing even with the page and the weather working. There are two ways out, and they cost very differently:

- **A Copy at the Edge** - publish the places table every week as a read-only file in Cloudflare R2 (1.24 million places at the 2026-10-20 fill; its size as a file is not measured yet), and let the browser read the part under a ring when the pod does not answer. Nothing new to run, and inside R2's free tier.
- **A Second Site** - run the app and a standby copy of the database on a small rented server, with a second cloudflared on the same tunnel, so Cloudflare sends traffic there when the house is down. Full parity, at about $10 to $20 a month, and one more machine to look after.

I'd start with the copy at the edge. It covers the house going away completely, and it needs nothing running.

### The Database: Backups, and a Fill That Starts Itself

There is no backup today. CloudNativePG can stream its write-ahead log and take a nightly base backup to object storage (R2 again), so a lost pool comes back in minutes rather than a planet rebuild. And when the planet fill finds the places table empty, it should start without waiting for Sunday.

### Alerting

Nothing tells anyone when Bluebird Forecast breaks, so every outage so far was found by someone using it. The targets above become alerts on how fast each budget burns, and one probe from outside the house checks the page and a real analysis every minute. Both go to a phone. This lives in the deployment, not in this repository, so it is listed under [What Waits on Other Repositories](#what-waits-on-other-repositories).

### What Stays Out of This Plan

- **A third weather source with different numbers.** #934 refused NWS, MET Norway and Pirate Weather for good reasons, and the mirror makes them unnecessary.
- **Making the overlays critical.** They stay best effort. They just have to say when they are down.

<hr>

## Mitigations

<hr>

## What Waits on Other Repositories
