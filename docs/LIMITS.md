# Limits

Bluebird Forecast caps seven things: the area of a search polygon, how many
points its ring may carry, how many destinations one analysis may forecast, how
many rows a response returns, how far back in time a window may reach, how large
a request body may be, and how fast a single client may ask. Every one of those
numbers is published as JSON by
`GET /api/capabilities`, read from the same constants the validators enforce,
so it cannot drift from what the service actually does:

```bash
curl -s https://bluebirdforecast.com/api/capabilities | jq .limits
```

Read the values there rather than from this page. What follows is the part a
JSON payload cannot tell you: why each cap exists, and what you see on hitting
it.

The web app reads that endpoint too, and treats it the same way you should: it
draws its calendar, gates its Analyze button and classifies its windows from the
values the running deployment publishes. The numbers compiled into the browser
bundle are the fallback for the moments before that answer arrives, and for a
deployment where the request fails. So a self-hosted instance that changes one
of these does not need a matching frontend build for the app to respect it.

**Polygon area.** This bounds the map query, not the forecast work.
Overpass runs on donated hardware behind a shared dispatcher, and past a
certain box size it stops answering and returns a "too busy" error instead of
results. The ceiling was set by measuring where that begins against the
production peaks query, and `backend/app/limits.py` records those measurements
with their date so the next person tempted to raise it re-measures first. The
sidebar shows the estimated area as you draw and disables Analyze past the cap;
the backend validates it again and answers `422`, so a bypassed frontend gains
nothing. The figure shown is a bounding-box approximation rather than true
polygon area, so an irregular shape often queries less terrain than the number
suggests.

**Points in a polygon.** The area cap measures only the box around a ring, and
every point of the ring is copied into each clause of the map query, so a dense
ring inside a small box would still send the donated Overpass servers an
enormous query from this deployment's one address. A ring with more points than
`limits.max_polygon_points` is refused with a `422` carrying Pydantic's own
message, and the count includes the closing repeat of the first point, as
GeoJSON writes a ring. A ring drawn by hand needs dozens, and the cap sits above
the most a shared link can carry through the edge's URL limit. In the web app
the draw tool stops placing points at the cap, and a shared link whose ring is
longer opens without its polygon, the way a malformed one does.

**Destinations per analysis.** Discovery is never sampled. Every named feature
inside the polygon gets a real forecast, which is what makes the winners the
genuine extremes of the area rather than the extremes of a sample. That
exactness is also the cost, so the candidate count, not the polygon, is what
actually bounds upstream spend. Past the cap an analysis refuses with a `400`
rather than truncating quietly. The sentence states only what is wrong; the
remedies ride as fields on the body: an elevation floor computed to bring the
search back under, or an explicit opt-in to analyze the highest candidates and
say so in the response. In the web app the same cap is enforced in the browser
before anything is fetched, so the refusal arrives with no request made; the
`400` is what a direct API caller sees. Coordinates you paste yourself count
toward the same cap, because a pasted coordinate costs exactly what a
discovered one costs.

**Rows returned.** The max-results knob trims the ranking after it is computed.
It never reduces the upstream work, which is why raising it costs nothing and
lowering it saves nothing. A shared link asking for more rows than the running
service allows opens at the allowed number rather than having the request
ignored, so the link still means what it says as far as the deployment permits.

**How far back a window may reach.** Two published numbers rather than one, and
the difference is which endpoint answers. `past_data_days` is where the forecast
endpoint's own data stops; past it a window is served from the archive endpoint
instead, and `archive_days` is how far back that reaches. The archive's real
depth is decades, so what bounds this is a deployment choice about how far a
calendar should page, not a limit of the data. `max_past_days` is the accept
bound the validator enforces, which carries slack above `archive_days` so an
edge window is never falsely refused. A window that starts older than
`past_data_days` and ends inside it belongs to both endpoints: each batch is
fetched twice and the hours are joined in order before anything is aggregated, so
it costs two upstream requests rather than one and refuses nothing.
[DATA.md](DATA.md#open-meteo) has what else is different about an archive
answer.

**Request body size.** The service has to read and parse a JSON body before
anything can look at it, its own per-address budget included, and the parse
costs many times the body's size in memory. So a body larger than
`limits.max_request_bytes` is answered `413` before a byte of it is read, or, if
it arrives chunked with no declared length, at the moment it passes the cap. The
cap sits above the largest request the schema accepts: the most custom
destinations, every name at its longest, every character one that needs four
bytes and written as escapes. Nothing a valid request can carry meets it. Every
list inside a request has its own maximum too, stated in the schema, so a body
under the size cap with an over-long list gets Pydantic's `422` naming the list.

**A long archive window without a key.** Not another published number, because
it is not one: it is what the deployment's weighted pacer can serve, and that
depends on both the window and the candidate count. A request costs more
weighted calls the longer its window, so over an archive window of a couple of
months an unkeyed analysis of a few hundred destinations queues its own later
batches past the pacer's wait bound. Rather than spend its first batches and
then answer `503` on every retry, such an analysis is refused before any
forecast is fetched, with a `400` that carries `found` and `limit`, the most
destinations that window can take. A forecast window never meets it, and a
request carrying your own Open-Meteo key never does either, because a keyed
request skips the pacer. [API.md](API.md#when-a-search-finds-too-much) has the
body.

**Request pacing.** Analyze, discovery, search, wildfire perimeters, smoke
plumes, and closure orders hold separate per-address budgets, so a burst of map searches cannot
starve somebody's analysis. Past one you get a `429` with `Retry-After`. They are sized
so a person iterating on a map never meets them. A script should stay well under
them anyway, and can sidestep them entirely by running its own container, where
every limit is tunable or off.

An Open-Meteo key changes exactly one of these limits, and it is not one of
the seven. The deployment's weighted pacer, which spreads a large fan-out over
minutes so the shared free-tier quota is never exhausted, does not meter a
request that carries a caller's key: that request spends the key's quota, which
the pacer knows nothing about and cannot protect. Everything else still applies
to it. The per-address analyze budget above holds, the cap on in-flight
upstream calls holds, and the candidate cap, the polygon cap, and the row cap
are all unchanged. A key buys a quota, not an exemption.

The wildfire, smoke and closure budgets are the loosest, because the requests they pace
are the cheapest the service answers: all three come from a snapshot the instance
already holds, so a pan costs no upstream call at all. What those budgets
protect is this instance's own bandwidth, not the providers' quotas, which are
bounded instead by how often each snapshot refreshes.

The rain-radar and snow-depth overlays appear in none of this, and deliberately.
Their images go from Iowa Environmental Mesonet and from NOAA straight to the
browser rather than through this service, so there is no request here to pace and
no snapshot to hold. What bounds that traffic is the layers being off by default,
IEM's own five-minute edge cache, and — for snow, which refuses caching entirely
— a 512 px tile, which is four times less of NOAA's render time per screen. See
[DATA.md](DATA.md#rain-radar) and [DATA.md](DATA.md#snow-depth).

When a request fails rather than refuses, the status code says whose problem it
is and whether waiting helps:

| Status | What happened |
|---|---|
| `400` | The request is runnable in shape but not as asked. Past the candidate cap it carries the remedies above; naming a regional forecast model for somewhere outside its grid is a second case, and there the fix is a different model rather than a smaller area. |
| `401` | The weather service refused the API key an analyze request carried. Nothing here can fix it and no retry helps. |
| `413` | The request body is larger than the published size cap, and was refused before it was read. Only a smaller body helps. |
| `422` | A field would not parse or failed a bound: a polygon over the area cap, a ring with too many points, a list longer than its maximum, a `limit` out of range, a window outside the horizon, a malformed `bbox`. Only the caller can change the outcome. |
| `429` | Either you are asking faster than your per-address budget, or the weather service rate-limited this deployment mid-analysis, or the edge rate rule in front of `bluebirdforecast.com` refused the request before the pod saw it (see [TRAFFIC.md](TRAFFIC.md)). `Retry-After` is honest in every case. |
| `502` | An upstream failed outright. Every Overpass mirror was unreachable, or the weather service did not answer. Transient, worth retrying. |
| `503` | This instance stayed at capacity long enough that it shed the request instead of queueing it forever. From `GET /api/wildfires`, `GET /api/smoke` and `GET /api/closures` it means something narrower: this instance has never once fetched that dataset successfully, so it has nothing to serve, not even stale. Transient either way, and carries `Retry-After`. |

Each of these carries a machine-readable `error.code` beside the sentence, so a
program can tell a failure it caused from one worth retrying without reading
English. [API.md](API.md#branching-on-the-error) has the table.

A load problem is never answered with a `500`, and Bluebird Forecast itself never
returns a `504`. An upstream that times out on us surfaces as a `502`, since
the timeout was theirs. A gateway timeout you do see came from something in
front of Bluebird Forecast giving up on a slow analysis, which is the case
`POST /api/analyze/stream` exists to avoid.
