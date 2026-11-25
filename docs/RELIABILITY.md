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

The bar is that Bluebird Forecast works the way a search engine does: you press the button, you get the answer, and you never wonder whether it will work. So each target names something you do, the share of attempts that must succeed, and how long success may take, over a rolling 28 days. A run that succeeds after a minute of countdowns counts as a failure, because that is not what you asked for.

| What you do | Succeeds | Within |
|---|---|---|
| **Open the Site** - the page loads and you can draw | 99.95% of loads, first visits with nothing cached included (about 20 minutes a month) | 3 s to a map you can draw on, at the 95th percentile |
| **Run an Analysis** - press Analyze and get a ranked table | 99.9% of runs (one in a thousand) | 8 s at the 95th percentile and 20 s at the 99th for up to 200 destinations over 3 days, 45 s at the 95th percentile at the cap (1,500 destinations, 16 days), and never longer than 30 s and 90 s respectively |
| **Run It Again** - change something and press Analyze inside the same minute | The same | The same: no countdown for having just run |
| **Open a Shared Link** - the link's analysis runs on open | The same as running an analysis | The same |
| **Ship a Fix** - a merged fix reaches production | 99% of merges | 30 minutes |

Four more are not about speed:

- **The Numbers Are Right** - wherever a forecast comes from, it matches what Open-Meteo itself answers for the same place, model and run, checked after every sync of our own copy.
- **The Numbers Are Fresh** - the model run an analysis reads is never older than twice that model's update interval, and the places table never older than eight days.
- **No Outage of One Provider Stops an Analysis** - however long it lasts. Every dependency on the path from opening the site to a ranked table has a second source that does not fail with the first.
- **Nothing Is Lost for Good** - the database can be put back from a backup to within a day's changes, inside an hour, and that restore is rehearsed every quarter. A backup nobody has restored is a hope.

### What Counts

- **A run counts** from the press to a ranked table or a stated failure. A cancel after the latency target counts as a failure, because nobody cancels a run that is going well, and a run whose tab closes before it ends is reported as it closes.
- **A table with a column reading N/A** where it should have a value (air quality, snow depth, wildfires, closures) is a degraded success. It counts as a success, and its share is tracked as a number of its own, so success cannot drift into "something rendered".
- **A run refused before it starts** (the ring is over the area cap, nothing is ticked) does not count. A run refused for the hour's Open-Meteo quota does, because that is exactly the failure a second source exists to remove.
- **A failure on the reader's own network** (a trailhead with no signal, a portal, a blocker) does not count when the browser could not reach bluebirdforecast.com itself either.
- **The overlays and place search** are not counted against the budget. Each layer must say when its feed is down or more than a day old rather than drawing nothing, and that promise is a test, not a percentage.

### How It Is Measured

The site sees about 50 analyses a month, which is far too few to read a 99.9% from: one failure is 2%, and a 95th percentile of 50 runs is two or three runs. So the targets are held on **synthetic runs**, the way low-traffic services are (the Google SRE Workbook's alerting chapter): an outside probe runs a real analysis every five minutes, about 8,000 runs in 28 days, which gives a budget of eight failures and makes alerts on it meaningful. It runs against our own weather copy, because the free tier's 10,000 calls a day would last 19 of them. The browser's own report of each real run (outcome, duration, which stage and which source failed it) is the diagnostic beside it, and settles questions like the one in the evidence above.

### How I Got These Numbers

A healthy 200-destination run takes 4 to 6 s today (520 weighted calls, eight requests through four open ones, measured batches of 1.5 to 1.8 s), so 8 s leaves room for one fallback and nothing more. The cap's 45 s is what 60 requests take without the free tier's minute-by-minute pacing; on the free tier alone the same run takes 7 to 8 minutes of pacing by design. The ceilings of 30 s and 90 s are there because the complaint is the wait as much as the failure. Today nothing bounds a run's total time except Cancel.

### The Error Budget

A target with no consequence is a wish. So while a 28-day window has spent more than its budget, the next change to ship is a reliability fix, and new features wait. Each budget's burn is an alert (see [Alerting](#alerting)), so nobody has to go looking. Record: [0339](architectural-decision-records/0339-reliability-targets-held-on-synthetic-runs.md)

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

### Open-Meteo Fails Rarely, but Alone

Open-Meteo's measured failures are few: on 2026-11-13 `api.open-meteo.com` gave no answer for over a minute while its archive and air-quality hosts answered at once, and every analysis failed, on wifi and on a phone (#934); on 2026-10-20 it refused a 262-destination run for holding too many requests open (#783); and every probe on 2026-11-25 answered. That is a thin record, and it is not why this plan replaces it. The reason is that it sits alone on the path, so the day it is down for a week, nothing else can answer.

One number I first read as Open-Meteo's is not. Until 2026-10-27 the release's canary ran one analysis through the pod, and between 2026-09-24 and 2026-10-22 that answered `502` 96 times out of 101. However, the pod's own counter saw only 13 Open-Meteo requests in those 60 days, and the days of the `502`s line up with Overpass failing during discovery on the same route. So most of those were Overpass.

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
| 2026-09-24 to 10-22 | The release probe's analysis answered `502` 96 of 101 times, mostly discovery failing on Overpass | Prometheus, #787 |
| 2026-10-20 | Open-Meteo refused a 262-destination run the pacer thought was under budget | #783 |
| 2026-10-21 | A release aborted because its probe hit Open-Meteo's spent daily quota | #787 |
| 2026-11-13 | `api.open-meteo.com` hung for over a minute and every analysis failed | #934 |

Between 2026-09-25 and 2026-11-25 the release pipeline also failed 5 times in 134, each time at creating the GitHub release or bumping the deployment, and each held production on the previous version until someone re-ran it.

<hr>

## The Architecture

The rule is short: **nothing on the path from opening the site to a ranked table depends on one thing**, and the path used when something fails is the path used every day, so it is always known to work (static stability, in the trade's words). Every dependency is either owned, meaning it runs on our machines or its data is copied to somewhere we control, or paired with a second source that fails for different reasons. Bluebird Forecast already did this twice. The places table replaced Overpass for discovery (#760), and the snapshots in the database let the overlays ride out their providers for a day (record 0182). So this plan does the same for everything that is left. Record: [0340](architectural-decision-records/0340-every-critical-dependency-owned-or-paired.md)

The weakest thing Bluebird Forecast owns is the house: one machine, one power feed, one internet line. So the plan never makes the house the only place something lives.

### The Page: Static Hosting, Not a Cache

Today the pod serves the page, so the house going offline shows Cloudflare's error page, even though the analysis runs in your browser. A cache rule would not fix that: Cloudflare keeps a copy only in the data centers that served it recently and may drop it at any time, and its stale-on-error covers an origin that answers 500 to 504, while a dead tunnel answers 530.

So the release pipeline deploys the built page and its hashed assets to Cloudflare Pages (or R2), keeping the last few builds' assets so a page loaded before a release still finds its files, and only `/api/*` goes through the tunnel to the house. The page then never depends on the house, and a frontend fix can ship while the house is down. A service worker adds the last published limits and model list, so a returning visitor can open the site and run with the pod unreachable. It ships with an off switch and an update-on-load rule from its first version, because a bad cached page is the one failure it adds.

### Weather: Our Own Open-Meteo, Then Theirs

Open-Meteo's server is open source, and every model it serves is published to a public bucket that anyone can read without an account. So we can run the same server with the same model data, and it gives the same numbers. That answers the reason #934 gave for refusing a second provider: a different provider's numbers would disagree with the ones the table ranks on, but our copy of Open-Meteo's cannot.

The browser then holds a **list of sources** and asks them in order, with three well-known techniques:

- **A Hedged Request** - if a batch has no answer by the time the first source's own 95th percentile for a batch that size has passed, the same batch goes to the next source and the first answer wins. Hedges are capped at a few percent of a run's batches, so a slow source cannot double the spend on the free quota (Dean and Barroso, "The Tail at Scale").
- **A Circuit Breaker** - a source that fails or loses twice is skipped for a few minutes and then tried with one batch, so a dead source costs the first batch a few seconds and the rest of the run nothing.
- **Retries That Are Bounded** - a 5xx or a dropped connection is retried once at once and then fails over, under one time budget for the whole run, in place of today's 20 s per attempt and 10, 20 and 30 s waits.

With one source in the list this is today's app with better retries. A second entry is configuration, not a release.

**Where the mirror lives** is the real decision, and I'd put it outside the house:

| Option | Fails with | What it costs |
|---|---|---|
| **A Mirror in the House** | The house | Disk for 450 to 600 GB (all eight models, about 58 days back; 350 GB is the measured floor), and 3 to 6 TB a month of downloads on the home line if each sync refetches the files a run rewrote (arithmetic from the files' sizes, not measured) |
| **A Mirror on a Rented Server** | Neither the house nor Open-Meteo's servers | The same disk and transfer on a server with a few hundred GB of disk, roughly $20 to $40 a month, and one more machine to look after |
| **Open-Meteo's Paid API, Behind a Worker** | Open-Meteo | About $29 a month for a million weighted calls (1,400 typical runs or 160 at the cap), a Worker holding the key with a per-address limit and a monthly ceiling, and no protection when Open-Meteo itself is down |

Two levers cut the mirror's size and transfer by more than half: Open-Meteo's sync takes a bounding box or a polygon, so the mirror can hold the regions readers use and send the rest to the public hosts, and it can keep a week of past days rather than 58, sending older windows to the public hosts too. Either needs the browser to treat a mirror's all-null answer as "ask the next source", not as "no coverage". Before committing to any of it, one model's sync runs for 48 hours and its bytes are read.

**The mirror must prove it is right**, because a mirror that is stale or wrong answers `200` and nothing fails:

- It takes a model out of service when that model's `meta.json` (its last run and update interval, published beside the data) is older than twice the interval, and the browser reads that before preferring it.
- It syncs the 90 m elevation model (`copernicus_dem90`, 10.5 GB) that every temperature is lapsed to, every regional member of each `*_seamless` blend, and both wind components at every level, or its numbers drift with no error.
- A job compares fixed points against Open-Meteo's public answer after every sync, and alerts on a difference.
- Each run records which source and which model run answered it, and a run is answered by one model run, so rows ranked against each other never come from two.
- It sits behind its own Cloudflare rate rule and answers `429` past a concurrency limit, because an unmetered Open-Meteo on a public name will be found and scraped. The browser moves to the next source on that `429`.

**Past windows** stay on Open-Meteo's archive host. Its default answer blends ECMWF's 9 km model with ERA5, about 32 GB per variable per year for the ECMWF part alone, so a faithful archive mirror is as large as the forecast one. I'd leave past windows protected only by the retries, and say so.

**If Open-Meteo itself stops** (its ingestion, not only its servers), the bucket stops updating and the mirror ages: HRRR has no future hours after two days. The answer to that is running Open-Meteo's own download commands against NOAA, ECMWF and DWD directly, which is a large job. I'd write it down as an emergency procedure for GFS alone rather than build it.

### Finding Destinations: The Edge First

The places table lives in the house. So the plan publishes it, after every daily update, as a FlatGeobuf file in R2 (a format built for reading the features in a box over plain HTTP range requests), and the browser reads the part under a ring itself, asking the pod only when the file cannot answer. Every run exercises the edge path, so a house outage changes nothing about discovery. The pod's answer and the file's must match, unnamed peaks and the merge rule included, and a test holds them together. The file is roughly 100 to 150 MB (an estimate; it is not built yet), well inside R2's free storage.

Short of that, the browser falls to the pod's answer on any 5xx or after about 2 s, because a pod that has lost its database still answers, slowly.

### The Map Without Its Tile Host

Today an OpenFreeMap outage stops you drawing, since the ring tool waits for the remote style. The style, glyphs and sprites move into the app's own assets, the ring tool and the markers mount over a bundled plain style without waiting, and a failed style is retried on a timer. Then a tile outage costs the picture, not the analysis. Owning the tiles too (a weekly planet build as PMTiles in R2, the same pattern as the places table) is a later step and its size has to be measured first.

### The Database: Backups, and a Fill That Starts Itself

There is no backup today. CloudNativePG can stream its write-ahead log and take a nightly base backup to object storage, so a lost pool comes back in minutes rather than a planet rebuild of 82 minutes to the load (the load itself unmeasured) plus a 95 GB download. Its retention and weekly size are measured when it is set up, and a restore is rehearsed every quarter. When the planet fill finds the places table empty, it starts without waiting for Sunday. Inside the pod, a database that stops answering is noticed once and skipped for a while, rather than costing every request 5 s.

### A Bad Release

At about two releases a day this is the most frequent risk there is. The canary takes no visitor traffic and its gate never loads the page or runs an analysis, so a frontend bug that breaks analysis promotes straight to everyone. So the gate gains the browser suite's own draw-and-analyze run against the canary, the same run repeats after promotion, and a failure aborts back to the previous release. That last part reverses record 0083 (fix forward, never roll back), which is your call. Database migrations stay additive (expand, then contract) so the previous release can always read the schema.

### Cloudflare

DNS, the registrar, the tunnel and in this plan the page and the places file are all Cloudflare. Its large incidents have lasted from tens of minutes to a few hours, and one of them spends more than a month's 20 minutes. There are two honest answers: **accept it**, and leave Cloudflare-wide incidents out of the budget in writing; or move DNS and the registrar elsewhere with health-checked failover to a second static host and a second origin, for a few dollars a month and a real increase in moving parts. I'd accept it.

### Alerting

Nothing tells anyone when Bluebird Forecast breaks, so every outage so far was found by someone using it. The targets become multiwindow burn-rate alerts (page when an hour's burn would spend the month's budget in two days, ticket when three days' would spend it in the month), the synthetic runs page on their own from outside the house, and Prometheus's always-firing `Watchdog` pings an outside heartbeat that pages when the pings stop, because Prometheus lives in the house too.

### Proving It

Every "rides it out" claim on this page becomes a browser-suite spec that makes a host hang, refuse or answer nulls and asserts the run still lands inside its target. The suite already answers every third-party host from fixtures, so this is cheap, and it turns the plan's promises into regressions CI catches.

### What Stays Out of This Plan

- **A weather source with different numbers.** #934 refused NWS, MET Norway and Pirate Weather for good reasons, and a copy of Open-Meteo makes them unnecessary.
- **Making the overlays or place search critical.** They stay best effort. They just have to say when they are down.

<hr>

## Mitigations

Ranked by how much failure each removes for the work it takes. The ones in this repository are built in this PR, in this order; each row says what it removes and where it stands.

### In This Repository

| # | Mitigation | What it removes |
|---|---|---|
| 1 | **Report Every Run** (built) - one beacon per run, page load and uncaught error to a new pod route (outcome, duration, the stage and source that failed, destination count, window length, model, cancelled or not; no coordinates), counted in Prometheus | Nothing by itself, but no target can be held or checked without it |
| 2 | **Weather Sources as a List** (built, record [0345](architectural-decision-records/0345-weather-sources-hedged-under-one-run-window.md)) - published by `/api/capabilities`, with today's Open-Meteo hosts as the only entry until a mirror exists, a hedged request, a circuit breaker per source, and pacing only for sources with a quota | The single source; makes a mirror configuration, not a release |
| 3 | **Retries That Are Bounded** (built, record 0345) - a 5xx or a dropped connection retried once at once, then failed over; one time budget per run in place of 160 s per batch. Built as one 30 s outage window per run, so with only the public hosts a host that never answers fails the run in about 49 s rather than 160 s; meeting the 30 s ceiling needs the second source | One `502` in 60 batches failing a run; minutes of countdowns |
| 4 | **Never Hold a Finished Table** - snow depth given 3 s and filled in late, air quality stopped on its first timeout, `/api/capabilities` given 5 s, one retry and a last good copy | Up to 110 s held after the forecasts land; a session stuck on one model |
| 5 | **The Pacer's Bookkeeping** - a cancelled or failed run's bookings released, an analysis booked ahead of the grid and the comparison, rows with no elevation read from the cache | A minute's wait on calls never sent; a grid holding the next run for two minutes |
| 6 | **The Cloud Column Degrades** - a failed cloud batch reads null, as air quality does | Half the requests that can each fail a run |
| 7 | **The Database in the Pod** - a database that stops answering is skipped for 30 s, every read has a statement timeout, the connection has a connect timeout and keepalives, every `psycopg.Error` on a read path takes the fallback, and discovery has one deadline of about 20 s | 5 s added to every request while the database is down; a hang on a half-open connection; 222 s worst-case discovery |
| 8 | **Discovery in the Browser** - a 15 s deadline and one retry in place of 110 s and none, and the pod named rather than OpenStreetMap when the edge answers `502` or `530` | A dead pod read as "OpenStreetMap is not available" |
| 9 | **The Map Without Its Tile Host** - the style, glyphs and sprites in the app's own assets, a timed retry, the ring tool mounted without the remote style | An OpenFreeMap outage stopping you drawing |
| 10 | **The Overlays Say When They Fail** - each layer's approved "unavailable" sentence shown in the message list rather than only logged | "No fires" and "the fire feed is down" looking the same |
| 11 | **The Page Survives the Pod** - a service worker with an off switch, and the page's headers ready for static hosting | A returning visitor losing the site with the house |
| 12 | **Proving It** - a browser-suite spec per failure above: a host that hangs, refuses or answers nulls, with the run still landing inside its target | Every promise above quietly regressing |

### In Other Repositories, or Needing Your Call

| Mitigation | Where | Cost |
|---|---|---|
| The page and assets deployed to Cloudflare Pages or R2, `/api/*` through the tunnel | This repo's release workflow and the Cloudflare zone in yggdrasil | Free tier |
| The weather mirror, wherever it lives (see the table above) | bluebird-helm and Kubernetes-Manifests, or a rented server | Disk, transfer, possibly $20 to $40 a month |
| The places table published to R2 after every daily update, and read by the browser first | This repo (a job and the browser's reader) and an R2 bucket | Free tier |
| CloudNativePG backups to object storage, and a quarterly restore | bluebird-helm | Cents a month |
| The fill starting itself on an empty table | bluebird-helm | None |
| Burn-rate alerts, an outside synthetic run every five minutes, a heartbeat for `Watchdog`, a receiver that reaches a phone | Kubernetes-Manifests, plus an outside probe and heartbeat service | Free tiers exist |
| A browser check in the release gate, the same after promotion, and an automatic abort | Kubernetes-Manifests; reverses record 0083 | Your call |
| istiod at two replicas, cloudflared spread hard and pinned by digest, an alert on the certificate's age | Kubernetes-Manifests | None |
| Open-Meteo's paid API behind a Worker, as a third source | A Worker and a key | About $29 a month |
| Cloudflare-wide incidents left out of the budget, in writing | This page | None |

<hr>

## What Waits on Other Repositories

Each item in the second table above is drafted here and nowhere else, so nothing changes outside this repository until you have read it. When one is picked up, it moves to its own PR in its own repository and this list links to it.
