# Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind, freezing level, and (in the browser only) the wind bearing the map's playback arrows draw | Free (non-commercial) | None, or a caller's own key |
| [Open-Meteo Historical Weather](https://open-meteo.com/en/docs/historical-weather-api) (reanalysis) | Hourly precipitation, temperature and 10 m wind for windows older than the forecast endpoint's own history | Free (non-commercial) | None, or a caller's own key |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly US AQI | Free (non-commercial) | None, or a caller's own key |
| [OpenFreeMap](https://openfreemap.org) | Vector map tiles | Free | None |
| [Nominatim](https://nominatim.org) | Map search box place lookup | Free (1 req/s max, no autocomplete) | None |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com) | Active wildfire perimeters, United States only | Free (quota shared across all consumers) | None |
| [NOAA HMS](https://www.ospo.noaa.gov/Products/land/hms.html) | Analyst-traced smoke plumes, North America | Free (public-domain files, no quota) | None |
| [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/ogc/) | NEXRAD radar mosaic tiles, continental United States | Free | None |
| [NOAA NOHRSC](https://www.nohrsc.noaa.gov/nsa/) | Snow depth from the National Snow Analysis, coterminous United States | Free | None |

Every one of these is free and paid for by somebody else, and Bluebird Forecast
sends a key to none of them on its own behalf. The one exception is an API
caller's own Open-Meteo key, described below. The table says what each one
provides. It cannot say what the numbers coming back actually mean, or what
each provider asks of Bluebird Forecast in return, so the rest of
this section does: what every source can tell you, what it cannot, and why
Bluebird Forecast calls it the way it does. The licenses and credits each provider
requires are collected in [NOTICES.md](../NOTICES.md). A downloaded CSV
carries its own copy of the Open-Meteo and OpenStreetMap credits below the
data — CC BY 4.0 and ODbL both ask the credit to travel with every copy, and
a file is read detached from the screen that shows them — plus the NIFC
credit whenever the file carries the wildfire column.

## A forecast is not a measurement

Nothing in the results table was observed. Open-Meteo serves the output of a
national weather model, and those models re-run on their own schedules, ranging
from hourly to a few times a day. The value
against a given hour was therefore computed some time before you asked for it,
and the same hour can read differently tomorrow. Bluebird Forecast caches each location
briefly on top of that, a far smaller effect than the model cadence but not
zero. For conditions at a place right now, read an instrument. Bluebird Forecast
answers a different question, which models are good at: how do these places
compare to each other over the same hours?

Bluebird Forecast is a planning aid, not a safety tool. Verify anything you are betting
on against official sources such as [weather.gov](https://www.weather.gov)
before committing to backcountry travel.

## OpenStreetMap and Overpass

A destination exists in Bluebird Forecast only if a volunteer mapped it and gave it a
name. Unnamed summits are invisible to discovery, elevations come from the OSM
`ele` tag and are absent or wrong wherever the tag is, and coverage is uneven
by region in exactly the way volunteer mapping is uneven.
[Coordinates](USAGE.md#d-coordinates) exists for that gap:
whatever OSM does not know, you can paste.

OSM is also what gives a pasted coordinate its elevation. A CSV row carries a
name and a point and nothing else, so each one is matched to the nearest mapped
peak within about 150 metres and takes that peak's `ele` tag. Three things
follow from that, all of them visible in the Elevation column:

- **A point with no mapped peak beside it stays blank.** Against the bundled
  100-peak Washington lists the match rate is 97%; the misses are summits no
  volunteer has mapped as a node, not failures of the lookup.
- **The number is OSM's, not your guidebook's.** Where the two disagree, the
  column shows what OSM says, which is the same figure a polygon search shows
  for that peak. Agreement between the two ways of asking is the point;
  agreement with any particular book is not on offer.
- **It is best-effort.** If Overpass cannot be reached the rows simply keep a
  blank elevation and the analysis runs regardless, so a blank means "nobody
  could say" rather than "something broke".

An elevation you supply yourself in the API's `elevation_ft` is never
overwritten by this.

Overpass is the query service in front of OSM, run by volunteers on donated
hardware, and its operators publish a per-address concurrency policy that
Bluebird Forecast holds itself to separately for each mirror. Three public mirrors are
tried in order, and the order is not arbitrary: `backend/app/services/osm.py`
carries a dated table of measured response times behind it, giving the fastest
mirror a tight timeout and the slower fallbacks a looser one, so a healthy
primary is never held up waiting on the patience a last resort needs. Discovery
results are cached for several minutes, so redrawing the same polygon costs
Overpass nothing, and a resolved coordinate set is cached the same way, so
re-analyzing a pasted list at window after window asks only once.

## Open-Meteo

The free tier is for non-commercial use, needs no key, and meters **weighted
calls** rather than HTTP requests: each location inside a batched request counts
as its own call. A single large analysis can spend over a thousand of them,
which is why both the browser and the server pace their fetches against a
rolling budget instead of firing everything at once. Open-Meteo's terms reserve
the right to block abusive addresses without notice, and because the web app
fetches from *your* browser, the address at stake is yours. Pacing is courtesy
on the server path and self-defense on the browser path.

Pacing is visible rather than hidden. When an analysis is large enough to spend
its budget, the progress line says it is waiting on quota and counts down to
when it resumes, instead of appearing to hang. If Open-Meteo rate-limits us
anyway, a short block resumes on its own once the window passes, and a longer
one stops the analysis and says so rather than retrying into the wall.

An API caller can bring its own Open-Meteo key, and a keyed request reads the
same models from the same data: it goes to Open-Meteo's customer hosts
(`customer-api.open-meteo.com`, `customer-archive-api.open-meteo.com` and
`customer-air-quality-api.open-meteo.com`),
which answer the same models, the same variables, and the same response shape
as the free hosts. Nothing about the aggregation or the numbers changes. What
changes is whose quota pays, which is why the deployment's weighted pacer does
not meter a keyed request. [API.md](API.md) has the caller's side of this.

Bluebird Forecast's own [PolyForm Noncommercial license](../LICENSE) lines up with that
tier deliberately. A commercial deployment would need an arrangement with
Open-Meteo as well as one here.

**Wind is reported at the destination's own elevation.** Open-Meteo's
`wind_speed_10m` measures 10 meters above the *model's* terrain, which is
smoothed to the model's grid and sits inside the friction layer — on a summit
it understates what a person feels, and during a measured November storm the
100 m wind ran more than twice the 10 m value over Cascade summits
([#257](https://github.com/zimmertr/bluebird/issues/257)). So each hourly
fetch also carries the free-air wind at five pressure levels (925 / 850 /
700 / 600 / 500 hPa), and every wind number interpolates between the two
levels bracketing the destination's elevation, floored at the 10 m value —
free air can only add exposure, never shelter. Destinations with no known
elevation, or below the lowest level (~762 m — a valley really is sheltered),
report the plain 10 m wind. The level heights are the standard atmosphere's,
fixed rather than fetched: real level heights move a few percent with
weather, less than the model's own terrain error. Two caveats. This is still
a model's free-air wind, not a gust or a summit anemometer, and local
funneling can exceed it. And the map's forecast-grid overlay adjusts each
sample to the terrain height Open-Meteo resolves for that coordinate (its
~90 m elevation model, reported on every response) rather than to any
destination's claimed height — so high ground paints its real winds, but a
summit marker can still read somewhat windier than the cell containing it,
because the cell's height is the ground at the sample point, not the peak.

**The freezing level is an air temperature, not a snow surface.** Each hourly
fetch carries Open-Meteo's `freezing_level_height`, the height at which the
free-air temperature crosses freezing, and the table reports its minimum,
average and maximum over the window in feet above sea level — the same unit and
datum as the **Elevation (ft)** column, because the reading is the comparison
between the two. Open-Meteo quotes the height in whatever unit
`precipitation_unit` selects, and names that unit on every response, so a
request asking for inches (as every request here does) gets the height in feet
rather than meters, and the aggregation reads the declared unit instead of
assuming one. Three things bound what it can tell you.

First, it is a height in the air. On a clear, calm night the snow surface loses
heat by radiation and refreezes well *above* the freezing level, sometimes by
thousands of feet; under cloud, or in wind, it may not refreeze even below it.
So the number tells you where the air supported a refreeze, which is a
proxy for the crust you will walk on rather than a measurement of it. Read it
with the same window's cloud and wind in mind.

Second, zero is a reading. Open-Meteo clamps the value to 0 when the whole
column is below freezing, so a zero means the freezing level reached sea level,
not that no answer came back.

Third, only three of the eight models publish it at all: GFS Seamless, HRRR and
ICON. The other five answer the request with a column of nulls, which the table
shows as `N/A` in those three columns and nothing else — the aggregation keeps
the freezing level independent of every other figure, so a model that does not
carry it leaves precipitation, temperature and wind untouched. Which models
answer is decided from the data rather than from a list in the code, so a model
that starts publishing it needs no change here.

### History, and the boundary inside it

Two endpoints answer a window, and which one depends on how old the window is.

The forecast endpoint holds its own short history, and that history is shorter
than the range of dates it will accept: past roughly two months a request still
succeeds and comes back with no numbers in it. `limits.past_data_days` on
[`GET /api/capabilities`](API.md) is where that data stops, measured rather than
read off the docs.

Older windows go to the
[Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api)
instead, and `limits.archive_days` is how far back that reaches here. The
calendar offers exactly that, so every day it draws comes back with data.

Three things are different about an archive answer, and all three are the
archive's nature rather than a limitation of the wiring.

- **It names no model.** Everywhere else Bluebird Forecast sends an explicit
  `models=` (see below), and the archive is the documented exception: its default
  is a reanalysis — ECMWF IFS HRES with ERA5 and ERA5-Land — which is one dataset
  at every location, so there is no per-location pick to hide. The forecast
  models the panel lists never ran over those hours at all, so the picker does
  not apply and is disabled while an archive window is selected. Sending a model
  name the archive does not serve is worse than useless: measured 2026-09-12, it
  answers an unknown `models=` with a `200` and plausible data rather than an
  error.
- **Wind is the 10 m wind.** The archive accepts the five pressure levels the
  elevation adjustment above is built on and answers every hour `null`, so an
  archive row reports the plain 10 m wind for every destination, whatever its
  elevation. The app says so rather than leaving it here: the wind columns read
  `Wind at 10 meters` over such a window, against `Wind at elevation` over a
  forecast one, and a window crossing the boundary drops the qualifier because
  it averages both.
- **It has no freezing level.** The archive accepts `freezing_level_height`
  and answers every hour `null` under the unit `undefined` (measured
  2026-09-13), so the three freezing-level columns read `N/A` over an
  archive window, and over a crossing window they aggregate the forecast
  hours only.
- **A window may cross the boundary, and then it carries both.** A window that
  starts in the archive's range and ends inside the forecast endpoint's is
  fetched from each of them — the archive through the hour before the boundary,
  the forecast endpoint from the boundary on — and the hours are joined in order
  before anything is aggregated, so the report is one window rather than two
  halves. What changes across that join is what the two bullets above describe:
  the early hours are the reanalysis and name no model, the later hours are the
  model you picked; the early hours carry the 10 m wind and the later hours wind
  at the destination's elevation. Because the boundary moves with the clock, the
  same window asked about next week may be wholly the archive's. Nothing hides
  the seam: the panel names the day it falls on, and the forecast grid is out of
  play over such a report for the reason
  [the grid section](#the-forecast-grid) gives.

Air quality is not part of that split. It has an archive of its own on the same
endpoint — measured 2026-09-12, it answered a window 365 days back with real US
AQI — so an old window is an ordinary air-quality fetch, and an hour it cannot
answer degrades to `null` the way every other gap does.

## Choosing a model

Bluebird Forecast names a weather model on every request rather than taking Open-Meteo's
`best_match` blend, and the panel lets you change it. Two reasons.

**Models disagree.** Over three days at one Cascades summit, ECMWF and GFS both
totalled 0.000 in of precipitation while ICON gave 0.004 in. The blend picks per
location and never reports its pick, so two adjacent peaks in one ranking could
have come from two different models with nothing on screen saying so. Naming one
model is what makes a row reproducible and a shared link mean what it meant when
it was shared.

**Models reach different distances.** This is the part that changes the app's
behavior rather than only its numbers, so the calendar reads it: choosing a model
redraws the servable band, and a window already chosen is shortened to fit with
a note saying so. Two edges bound the far end and only one of them moves. The
API refuses a date past roughly 16 days whatever you ask for; inside that, each
model simply stops, returning nothing for the hours past its own reach.
`GET /api/capabilities` publishes how far each model reaches, which is where the
calendar gets the number rather than compiling its own.

The list is ordered best first, and the order is an editorial judgement about
mountain terrain rather than a sort on anything: grid spacing over the Cascades
is weighted above forecast length, so it runs roughly opposite to ordering by
reach. The two that lead it are seamless blends, which is why they do. The default,
**NOAA GFS**, is HRRR's 3 km grid to about hour 45 and GFS's out to sixteen
days. **ECCC GEM** is HRDPS at 2.5 km to about hour 45, RDPS at 10 km to hour
81, then GEM global — finer than the default through the first three days, at
the cost of stopping around nine.

The short-range outlier is **HRRR** itself, which reaches about two days. The
default already contains it for that stretch, so choosing it directly is for
when a number needs to be purely HRRR rather than a blend.

HRRR is the only **regional** model here. It is run over the continental US
and neighbouring parts of Canada and Mexico, and Open-Meteo refuses any point
outside that grid — a refusal that takes the whole batch with it, so a single
destination outside coverage fails the analysis rather than quietly dropping one
row. Bluebird Forecast does not ship a copy of HRRR's domain to check against, because
the grid is not a lat/lon rectangle and any copy would drift; Open-Meteo is the
authority, and its refusal is reported as one, naming the model and the fix.

### Comparing models on the chart

The chart draws every charted destination under every model ticked in the model
picker (issue #232), one line per pair and no ceiling on the models. It is drawn
rather than tabulated, deliberately, and three caveats come with it.

**Six of the eight are blends.** Each one serves an agency's fine regional model
for roughly the first two days and its coarse global model afterwards, so a
single line can change model partway along. `GET /api/capabilities` publishes a
`blend` flag on each model, read off the model's definition rather than its
name, and each model's summary in the picker says what it blends. Only ECMWF IFS and NOAA HRRR are one model for
their whole length.

**Reaches are ragged, so the chart clamps.** The models stop at different hours,
and an average over ten days of one model beside three days of another compares
nothing. Every line on a comparison therefore stops at the shortest reach among
the models on it, the analysis model's included, so a model whose reach falls
short of the analyzed window shortens every line beside it.

**A model with nothing there says so.** Asked about one model, Open-Meteo
answers HTTP 400 and names the problem, so a regional model outside its domain is
reported in a note beside the chart's metric dropdown rather than drawn. Asked about several
models at once it does not: measured 2026-09-12 at 46.5,8.0,
`models=gfs_hrrr,ecmwf_ifs025` answers HTTP 200 carrying a bare `precipitation`
key instead of the suffixed pair, which is one model's numbers under no label.
That is why each compared model is fetched as its own single-model request, and
why an unsuffixed key is treated as absent wherever one appears.

**A variable a model does not carry is silent, which is why two metrics refuse
the comparison outright.** Three of the eight models forecast a freezing level;
the other five answer HTTP 200 with a column of nulls, which is not an error and
cannot be told from a forecast that was never asked for. Air quality is the
mirror case: CAMS answers for every model alike, so a comparison there is the
same numbers several times. Neither can be discovered before the fetch, because
`GET /api/capabilities` publishes no per-variable flag on a model, so the panel
carries a list of the three models that serve the freezing level and blocks
**Analyze** on either contradiction rather than buying a report that cannot
answer the ranking. Everywhere a CELL is concerned the emptiness is still read
off the data, so a model that starts publishing the variable needs no code
change there; the list is the one place a new model has to be added.

The cost is real rather than free, which is why a comparison is bought by
Analyze rather than as you browse. Open-Meteo prices a request at
`locations × max(1, days/14) × max(1, variables × models/10)`, the browser asks
for ten hourly variables, and the analysis model's numbers are already held: a
comparison buys one model series per displayed destination per added model,
roughly one weighted call each, against the hundred or more an analysis of a
polygon spends. Displayed rather than charted, because the results table shows
one row per model and a blank cell there would read as a forecast rather than as
a row nobody fetched. Unticking a model buys nothing back and needs no Analyze, since
its line was drawn from numbers already in hand. Air quality is not part of it,
because CAMS is a single model whatever forecast model ranks the field.

## Air quality

AQI comes from [CAMS](https://atmosphere.copernicus.eu) through Open-Meteo, and
it carries three caveats the weather figures do not.

**It is coarse.** CAMS is an atmospheric model on a grid measured in tens of
kilometers, so the figure is a regional field sampled at your coordinates
rather than a reading at the summit. Neighboring peaks in one drainage
routinely return identical values because they land in the same model cell.

**It is short.** The air-quality horizon runs a fraction of the weather
horizon. Windows reaching past it still analyze normally: AQI columns come back
blank for the hours beyond it, and the app says so under the Analyze button, in
the one block where every notice renders.

**It is American everywhere.** The `us_aqi` figure applies the US EPA's
category boundaries worldwide, so a value for a peak in the Alps is still on
the EPA scale rather than the local index that country publishes. Compare it
against other Bluebird Forecast rows, not against the number on a local air-quality
site.

Air quality is also best-effort throughout. An outage or a rate limit there
blanks those columns and never fails the analysis, because a missing AQI should
not cost you a forecast.

## Nominatim

The map search box queries only when you press Enter, and that is a policy
requirement rather than a design preference. Nominatim's
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) caps
callers at roughly one request per second and explicitly forbids autocomplete,
which a search-as-you-type box violates by construction. The same policy
requires an identifying `User-Agent`, a header browsers refuse to let a page
set, which is why this one lookup is proxied through Bluebird Forecast's server instead
of running in your browser the way the weather fetch does.

## Map tiles

The basemap is OpenFreeMap's vector tiles, fetched straight from
`tiles.openfreemap.org` by your browser: the style document, its TileJSON, the
tiles, the glyphs and the sprites all resolve to that one host, which is the
only basemap origin the page's Content-Security-Policy allows. OpenFreeMap
publishes no quota and asks for nothing but the OpenStreetMap credit, which
arrives through the tile server's own TileJSON and is drawn in the map's corner
control rather than by the app. The tiles carry OpenStreetMap data under the
ODbL, which is why that credit links to OpenStreetMap's copyright page.

## Wildfires

The optional perimeter overlay and the proximity warnings on result rows both
come from NIFC's WFIGS service. The warnings run with every analysis whether or
not the overlay is switched on, and measure to the fire perimeter rather than
its centroid, because a large fire's centroid can sit many miles inside its own
edge.

Both read from **Bluebird Forecast's copy of the dataset, not from NIFC directly**. The
server holds one snapshot of every active perimeter in the country and refreshes
it on a timer, so the number of requests reaching NIFC is a fixed handful per
hour no matter how many people are looking at maps, and no visitor's warning
depends on a request of their own succeeding.

That indirection exists because of how the upstream quota works. NIFC meters a
**request quota belonging to its own ArcGIS organization**, shared by
every consumer of this public dataset, so it can be exhausted by traffic that
has nothing to do with Bluebird Forecast. It rejects over-quota queries in an unusual
way: HTTP 200, with the refusal in the response body, so nothing about the
status code says anything went wrong. When each browser asked NIFC for itself,
that made warnings appear and vanish between one analysis and the next, on a
resource nobody involved could see or influence.

Perimeters are served **past their refresh deadline** when NIFC is unreachable,
rather than expiring into nothing. A perimeter mapped an hour ago still answers
a ten-mile proximity question correctly, so withholding it would trade a good
answer for no answer.

Hovering a fire dates the perimeter: **Last updated** is when NIFC last
surveyed that incident, which is a fact about the fire and not about Bluebird Forecast.
It routinely runs days old on a fire that is burning right now, which is normal
for a surveyed product and not a sign of stale data on this end. If you are
calling the API directly, the response also carries `fetched_at`, saying how
current the copy itself is; see [API.md](API.md#wildfire-perimeters).

WFIGS is the authoritative national dataset and it is **United States only** —
the layer's checkbox says so. The API publishes what that means as a
`coverage` geometry riding every `/api/wildfires` response (a coarse US
outline, biased slightly outward, split at the antimeridian for the
Aleutians), and the app compares every analyzed destination against it, row
by row. A destination outside coverage reads `N/A` in the table's
**Wildfire (mi)** column and in the same column of a downloaded CSV, so a
missing warning is never mistaken for a clear check (a dash in the table, a
blank cell in the file) — while a covered destination in the same table keeps
its real answer. The outline is
coarse to roughly ±50 km, so a trip hugging the border may read as covered
from just outside it; the bias errs toward keeping a real US warning over
silencing a Canadian false one.

Both features remain best-effort, and a failed check is not silent. Every
row's **Wildfire (mi)** cell reads `N/A` with the reason as its hover text, a
warning under Analyze says NIFC is unreachable, and a downloaded CSV omits its
wildfire column rather than leaving it blank on every row. Reaching that state
now requires a server that has never once completed a fetch since it started,
rather than a single unlucky request. A blank cell in that column means the
check ran and found nothing within the radius; an absent column means no
destination was checked at all. The distinction matters more in a file than on
screen, because a file is read later, somewhere else, with nothing beside it to
say the check never happened. Perimeters are a surveyed product with reporting
lag, so read them as where a fire has been mapped, not where it is burning right
now. For decisions about an active incident, use
[InciWeb](https://inciweb.wildfire.gov) and the responsible agency.

## Smoke

The optional smoke overlay comes from NOAA's **Hazard Mapping System**, and the
first thing to know about it is that it is not a model. Analysts at NOAA look at
GOES satellite imagery and trace the visible smoke by hand, classing each plume
Light, Medium or Heavy. Roughly two passes land per day, the first around late
morning Eastern.

That has three consequences worth reading the layer with.

**It is observation, with a lag.** A plume states the window of imagery it was
traced from, which the popup shows, and that window can be hours behind now.
There is nothing here to animate, and the map timeline does not claim it.

**It is a column of air, not the ground.** A satellite sees smoke from above, so
a plume overhead can mean a hazy sky and perfectly breathable air, or smoke
sitting in the valley you are walking into. The two look identical from orbit.
The AQI columns in the results table are what measure air at the surface; this
layer answers where the smoke is, not what it is doing to you.

**Density is relative.** Light, Medium and Heavy are an analyst's judgement of
optical thickness in the imagery, not a concentration in any unit. They draw as
three opacities of one grey for exactly that reason: the encoding is "more" and
"less", which is what the source actually says.

HMS publishes one dated file per day and Bluebird Forecast's server fetches it, for the
same reason it fetches perimeters — one caller instead of one per visitor —
though the pressure is milder here, since NOAA serves these off a plain file
server with no quota to exhaust. What the server buys instead is the date
arithmetic: before the day's first pass lands, that file does not exist yet, and
the fetch falls back to yesterday's analysis rather than reporting an outage.
The response says which date it served under, so the fallback is visible rather
than silent; see [API.md](API.md#smoke-plumes).

Coverage is North America, which is what HMS analyzes. Elsewhere the layer is
empty, and empty means "not covered" rather than "clear air".

## Rain radar

The optional radar overlay is the **NEXRAD base-reflectivity mosaic**, served as
raster tiles by the Iowa Environmental Mesonet at Iowa State University. It is
the one layer in Bluebird Forecast that is a measurement rather than a forecast:
everything in the results table is a model's opinion about the future, and this
is where rain was actually falling in the last hour.

The tiles go straight from IEM to your browser rather than through Bluebird Forecast's
server. They are keyless, CORS-open, and cached for five minutes at the edge, so
there is nothing for the server to hold that the browser would not fetch anyway.
IEM asks only that applications with thousands of simultaneous users arrange
their own hosting, which an off-by-default toggle on a hobby-scale site
respects.

The loop is **six frames spanning 50 minutes**, ten minutes apart. Frames are
addressed as "ten minutes ago", "twenty minutes ago" and so on rather than by
timestamp, which is the form the service documents, and that is why the timeline
reads out a relative time: the capture moment is only known to within the step.
Two consequences follow. Adjacent frames occasionally resolve to the same
mosaic, when the radars happened not to run between them. And because the
offsets are relative to when a tile is requested, panning mid-loop can pull
slightly newer imagery into an older frame, which the loop's own refresh bounds.

The step is ten minutes rather than the mosaic's own five-minute cadence for a
reason that is about the map library, not the data. Each frame is its own raster
layer, and at twelve of them MapLibre's tile queue jams: measured against the
live service, six frames load, the seventh stalls partway, and the last five are
never requested at all — permanently, with every missing tile answering 200 to a
direct fetch. Six frames also halves the roughly 420 tile requests a full loop
sends to a donated server, which is its own argument.

Coverage is the continental United States. Reflectivity is not a rainfall rate:
it is what the radar echo measured, which hail, bright-band melting, and beam
blockage in mountain terrain can all colour. Read it as where the storm is, not
as how much water is landing on a summit.

## Snow depth

The optional snow overlay is the **NOHRSC National Snow Analysis**, produced by
the National Weather Service's National Operational Hydrologic Remote Sensing
Center. It is a model of the snowpack constrained by ground-based, airborne and
satellite snow observations, on a 1 km grid, and it is the best statement of how
much snow is on the ground that exists for the United States.

Like the radar, it is an **observation rather than a forecast**: it says where
snow lies now, not where it will lie. That is what puts it on the map beside
radar, smoke and fire instead of in the results table, and it is why switching
it on never asks you to press Analyze again.

**It updates four times a day**, at 20 minutes past 01, 05, 11 and 17 UTC. A
snow depth is therefore hours old at worst, which is the right resolution for a
thing that changes over days.

**Coverage is the coterminous United States**, with the analysis grid running a
little into southern Canada and northern Mexico. There is no Alaska, no Hawaii
and nothing outside North America. Outside that extent the layer draws nothing,
and nothing means "not analyzed" rather than "no snow". The Layers row says
`US only` for that reason, the way the wildfire row does.

The images go **straight from NOAA to your browser** rather than through
Bluebird Forecast's server. The service has no cached tiles: it renders a PNG
per request, at the bounding box and size asked for, and it refuses caching
outright (`cache-control: max-age=0, must-revalidate`). So every pan is a fresh
set of renders, measured at about half a second each. Two things bound that
cost and neither is a proxy. The layer is off by default, and the tiles are
512 px rather than 256, which is four times less of NOAA's render time for the
same screen — a render costs the same whatever its size, because the time is
the render and not the pixels. A cache in the pod was considered and rejected:
it would make this service a tile server for a layer most visitors never switch
on, for a product NOAA already serves.

Read the depth for what it is. It is an analysis on a 1 km grid, so it is an
average over a square kilometre of ground that may run from a valley floor to a
ridge. On steep terrain the real depth at a point can be several times more or
less than the colour says, and a summit can hold snow the grid cell around it
does not. The bands are NOAA's own, in inches, and so are the colours: the map
draws NOAA's rendered image, so the legend has to be a key to that image rather
than to a palette of this app's own.

## The forecast grid

The forecast grid overlay paints the ranked metric across the area an analysis
covered, as a continuous field. It is the same Open-Meteo data as the results
table, asked for on a lattice of points instead of at destinations, and it is
worth being precise about what it is and is not.

**Two styles, both true, and the panel picks between them.** *Blocks* draws
each sample as its own square, which shows you where the samples are: the
model's real detail is something you can see and count rather than a number in
a legend. *Smooth* draws the space between them, which reads the way every
other forecast map reads. Each hides what the other shows, which is why neither
is the only option.

**Smoothing here is between model grid points, not between destinations.**
Bluebird Forecast refused a forecast raster once, on the grounds that blending
temperature between two summits across the valley between them invents numbers
in exactly the terrain this app serves. That objection was right about
interpolating between *destinations* and does not apply to a field between grid
points. Open-Meteo answers a coordinate with the value of the model grid cell
containing it, so sampling at the model's own spacing means neighbouring
samples are neighbouring grid cells, and what is drawn between them is
something the model already treats as continuous. Every meteorological renderer
draws it that way. The blocks style makes the opposite trade honestly: its
edges assert a boundary the model does not have, in exchange for showing you
exactly how many answers the picture rests on.

**The sample spacing is the claim, and the legend states it.** `Forecast grid   3 km`.
That number is the distance over which the picture is a drawing
rather than a measurement: within it you are looking at one forecast, and
between two of them you are looking at a blend. It comes from the finest grid
the chosen model publishes, which is the spacing at which asking twice can give
two different answers. Over a large area the samples are spread further apart
so a grid stays a few hundred requests rather than tens of thousands, and the
legend always states the spacing actually used rather than the model's headline
figure.

**There is no grid over archive hours.** A window older than the forecast
endpoint's own history is answered by the archive, which names no model and
reports a reanalysis on a coarser grid than any forecast model's finest figure
(see [History, and the boundary inside it](#history-and-the-boundary-inside-it)).
Sampling that at a model's pitch would paint real numbers at a spacing nothing
produced them at, and the legend would state that spacing as the claim. So the
overlay is out of play while such a report is on screen: its switch is disabled
rather than drawing a picture whose one stated number would be wrong. A window
that crosses the boundary is the same problem over half a report, so it is out of
play there too, and the row says why.

**A model's finest grid is not its resolution everywhere.** The seamless models
blend a fine regional grid into a coarse global one, so NOAA GFS is a 3 km model
over North America and a 13 km one over Nepal. Bluebird Forecast samples at the finest
figure the model publishes, which means that outside the fine region several
samples can land in one real grid cell and simply agree with each other. A flat
field is the honest picture of that: it is what "the model has one answer for
this whole area" looks like. The same goes for AQI, which comes from CAMS at a
much coarser grid than any of the weather models, so an AQI field is usually
smooth and featureless, and that is the data rather than a rendering artifact.

**The field can disagree with a marker standing on it.** One 3 km grid cell
holds a summit and the valley floor below it, and the model answers for the
cell, not for either. The destination's own row is a forecast for its own
coordinates; the field under it is a forecast for a nearby grid point, blended
with its neighbours. Where the two differ, what you are seeing is the resolution
limit of the model itself, which is the most useful thing a field can show you
about a forecast.

**It covers where the analysis looked, not the whole map.** The lattice spans
the destinations an analysis found, plus a margin, and it fades out at that
edge rather than stopping at a hard line. Panning away from your search area
does not extend it, because every sample is a live request against a free
service on your own quota rather than a pre-rendered tile.

## Where the links go

Two sites the app links out to are not data sources, since nothing is fetched
from them, but a reader lands on them often enough to say what to expect.

**Windy.** Every metric cell in the results table and every row of a map popup
is a link to Windy, opened on the same coordinates, the same overlay, and the
same forecast model the row was analyzed with; a **Min** or **Max** cell also
opens on the hour that produced it. Windy's deep-link grammar is undocumented
and was measured against the live site (2026-09-14): it snaps the hour to the
model's own step, clamps an hour past that model's reach, ignores a time in the
past, and where it carries no regional model for a destination it falls back to
its own default. A Windy page is Windy's forecast, from its copy of the model,
so its numbers can differ from the cell that linked to it.

**Peakbagger and OpenStreetMap.** The arrow beside a peak's name opens
Peakbagger's coordinate search centred on the summit, which lists the clicked
peak first; Peakbagger has no mapping from OSM ids, and a name search there is
ambiguous for a common name. Every other row links to the exact OpenStreetMap
object it came from, and a row with no OSM id (a pasted coordinate) links to a
map pin at its coordinates.
