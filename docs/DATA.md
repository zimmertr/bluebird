# Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind | Free (non-commercial) | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly US AQI | Free (non-commercial) | None |
| [OpenFreeMap](https://openfreemap.org) | Vector map tiles | Free | None |
| [Nominatim](https://nominatim.org) | Map search box place lookup | Free (1 req/s max, no autocomplete) | None |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com) | Active wildfire perimeters, United States only | Free (quota shared across all consumers) | None |
| [NOAA HMS](https://www.ospo.noaa.gov/Products/land/hms.html) | Analyst-traced smoke plumes, North America | Free (public-domain files, no quota) | None |
| [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/ogc/) | NEXRAD radar mosaic tiles, continental United States | Free | None |

Every one of these is free, keyless, and paid for by somebody else. The table
says what each one provides. It cannot say what the numbers coming back
actually mean, or what each provider asks of Bluebird in return, so the rest of
this section does: what every source can tell you, what it cannot, and why
Bluebird calls it the way it does. The licenses and credits each provider
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
and the same hour can read differently tomorrow. Bluebird caches each location
briefly on top of that, a far smaller effect than the model cadence but not
zero. For conditions at a place right now, read an instrument. Bluebird
answers a different question, which models are good at: how do these places
compare to each other over the same hours?

Bluebird is a planning aid, not a safety tool. Verify anything you are betting
on against official sources such as [weather.gov](https://www.weather.gov)
before committing to backcountry travel.

## OpenStreetMap and Overpass

A destination exists in Bluebird only if a volunteer mapped it and gave it a
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
Bluebird holds itself to separately for each mirror. Three public mirrors are
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

Bluebird's own [PolyForm Noncommercial license](../LICENSE) lines up with that
tier deliberately. A commercial deployment would need an arrangement with
Open-Meteo as well as one here.

History reaches back only as far as the forecast endpoint's own archive, and
that archive is shorter than the range of dates the endpoint will accept. Past
roughly two months a request still succeeds and comes back with no numbers in
it, so Bluebird's calendar stops well before the date the API stops accepting.
Going further would mean the separate
[Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api),
which is not wired up.

## Choosing a model

Bluebird names a weather model on every request rather than taking Open-Meteo's
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
reach. Two models are seamless blends and that is why they lead it. The default,
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
row. Bluebird does not ship a copy of HRRR's domain to check against, because
the grid is not a lat/lon rectangle and any copy would drift; Open-Meteo is the
authority, and its refusal is reported as one, naming the model and the fix.

## Air quality

AQI comes from [CAMS](https://atmosphere.copernicus.eu) through Open-Meteo, and
it carries three caveats the weather figures do not.

**It is coarse.** CAMS is an atmospheric model on a grid measured in tens of
kilometers, so the figure is a regional field sampled at your coordinates
rather than a reading at the summit. Neighboring peaks in one drainage
routinely return identical values because they land in the same model cell.

**It is short.** The air-quality horizon runs a fraction of the weather
horizon. Windows reaching past it still analyze normally: AQI columns come back
blank for the hours beyond it, and the app says so next to the date inputs.

**It is American everywhere.** The `us_aqi` figure applies the US EPA's
category boundaries worldwide, so a value for a peak in the Alps is still on
the EPA scale rather than the local index that country publishes. Compare it
against other Bluebird rows, not against the number on a local air-quality
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
set, which is why this one lookup is proxied through Bluebird's server instead
of running in your browser the way the weather fetch does.

## Wildfires

The optional perimeter overlay and the proximity warnings on result rows both
come from NIFC's WFIGS service. The warnings run after every analysis whether or
not the overlay is switched on, and measure to the fire perimeter rather than
its centroid, because a large fire's centroid can sit many miles inside its own
edge.

Both read from **Bluebird's copy of the dataset, not from NIFC directly**. The
server holds one snapshot of every active perimeter in the country and refreshes
it on a timer, so the number of requests reaching NIFC is a fixed handful per
hour no matter how many people are looking at maps, and no visitor's warning
depends on a request of their own succeeding.

That indirection exists because of how the upstream quota works. NIFC meters a
**per-minute request quota belonging to its own ArcGIS organization**, shared by
every consumer of this public dataset, so it can be exhausted by traffic that
has nothing to do with Bluebird. It rejects over-quota queries in an unusual
way: HTTP 200, with the refusal in the response body, so nothing about the
status code says anything went wrong. When each browser asked NIFC for itself,
that made warnings appear and vanish between one analysis and the next, on a
resource nobody involved could see or influence.

Perimeters are served **past their refresh deadline** when NIFC is unreachable,
rather than expiring into nothing. A perimeter mapped an hour ago still answers
a ten-mile proximity question correctly, so withholding it would trade a good
answer for no answer.

Hovering a fire dates the perimeter: **Last updated** is when NIFC last
surveyed that incident, which is a fact about the fire and not about Bluebird.
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

Both features remain best-effort, and a failed check is not silent. The results
header says **Wildfire check unavailable** and a downloaded CSV omits its
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

HMS publishes one dated file per day and Bluebird's server fetches it, for the
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
the one layer in Bluebird that is a measurement rather than a forecast:
everything in the results table is a model's opinion about the future, and this
is where rain was actually falling in the last hour.

The tiles go straight from IEM to your browser rather than through Bluebird's
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
Bluebird refused a forecast raster once, on the grounds that blending
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

**A model's finest grid is not its resolution everywhere.** The seamless models
blend a fine regional grid into a coarse global one, so NOAA GFS is a 3 km model
over North America and a 13 km one over Nepal. Bluebird samples at the finest
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
