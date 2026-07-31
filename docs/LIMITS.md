# Limits

Bluebird caps four things: the area of a search polygon, how many destinations
one analysis may forecast, how many rows a response returns, and how fast a
single client may ask. Every one of those numbers is published as JSON by
`GET /api/capabilities`, read from the same constants the validators enforce,
so it cannot drift from what the service actually does:

```bash
curl -s https://bluebirdforecast.com/api/capabilities | jq .limits
```

Read the values there rather than from this page. What follows is the part a
JSON payload cannot tell you: why each cap exists, and what you see on hitting
it.

**Polygon area.** This bounds the map query, not the forecast work.
Overpass runs on donated hardware behind a shared dispatcher, and past a
certain box size it stops answering and returns a "too busy" error instead of
results. The ceiling was set by measuring where that begins against the
production peaks query, and `backend/app/models.py` records those measurements
with their date so the next person tempted to raise it re-measures first. The
sidebar shows the estimated area as you draw and disables Analyze past the cap;
the backend validates it again and answers `422`, so a bypassed frontend gains
nothing. The figure shown is a bounding-box approximation rather than true
polygon area, so an irregular shape often queries less terrain than the number
suggests.

**Destinations per analysis.** Discovery is never sampled. Every named feature
inside the polygon gets a real forecast, which is what makes the winners the
genuine extremes of the area rather than the extremes of a sample. That
exactness is also the cost, so the candidate count, not the polygon, is what
actually bounds upstream spend. Past the cap an analysis refuses with a `400`
carrying remedies rather than truncating quietly: an elevation floor computed
to bring the search back under, or an explicit opt-in to analyze the highest
candidates and say so in the response. Coordinates you paste yourself count
toward the same cap, because a pasted coordinate costs exactly what a
discovered one costs.

**Rows returned.** The max-results knob trims the ranking after it is computed.
It never reduces the upstream work, which is why raising it costs nothing and
lowering it saves nothing. A shared link asking for more rows than the running
service allows opens at the allowed number rather than having the request
ignored, so the link still means what it says as far as the deployment permits.

**Request pacing.** Analyze, discovery, and search hold separate per-address
budgets, so a burst of map searches cannot starve somebody's analysis. Past one
you get a `429` with `Retry-After`. They are sized so a person iterating on a
map never meets them. A script should stay well under them anyway, and can
sidestep them entirely by running its own container, where every limit is
tunable or off.

When a request fails rather than refuses, the status code says whose problem it
is and whether waiting helps:

| Status | What happened |
|---|---|
| `429` | Either you are asking faster than your per-address budget, or the weather service rate-limited this deployment mid-analysis. `Retry-After` is honest in both cases. |
| `502` | An upstream failed outright. Every Overpass mirror was unreachable, or the weather service did not answer. Transient, worth retrying. |
| `503` | This instance stayed at capacity long enough that it shed the request instead of queueing it forever. Also transient, also carries `Retry-After`. |

A load problem is never answered with a `500`, and Bluebird itself never
returns a `504`. An upstream that times out on us surfaces as a `502`, since
the timeout was theirs. A gateway timeout you do see came from something in
front of Bluebird giving up on a slow analysis, which is the case
`POST /api/analyze/stream` exists to avoid.
