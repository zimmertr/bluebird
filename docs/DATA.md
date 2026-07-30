# Data Sources

| Source | Usage | Cost | Auth |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | Destination names, coordinates, elevation | Free | None |
| [Open-Meteo](https://open-meteo.com) | Hourly precipitation, temperature, wind | Free (non-commercial) | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) ([CAMS](https://atmosphere.copernicus.eu/) data) | Hourly US AQI | Free (non-commercial) | None |
| [OpenFreeMap](https://openfreemap.org) | Vector map tiles | Free | None |
| [Nominatim](https://nominatim.org) | Map search box place lookup | Free (1 req/s max, no autocomplete) | None |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com) | Active wildfire perimeters, United States only | Free | None |

Every one of these is free, keyless, and paid for by somebody else. The table
says what each one provides. It cannot say what the numbers coming back
actually mean, or what each provider asks of Bluebird in return, so the rest of
this section does: what every source can tell you, what it cannot, and why
Bluebird calls it the way it does.

## A forecast is not a measurement

Nothing in the results table was observed. Open-Meteo serves the output of
whichever national weather model covers a location best, and those models re-run
on their own schedules, ranging from hourly to a few times a day. The value
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
[Search by Coordinates](USAGE.md#c-search-by-coordinates) exists for that gap:
whatever OSM does not know, you can paste.

Overpass is the query service in front of OSM, run by volunteers on donated
hardware, and its operators publish a per-address concurrency policy that
Bluebird holds itself to separately for each mirror. Three public mirrors are
tried in order, and the order is not arbitrary: `backend/app/services/osm.py`
carries a dated table of measured response times behind it, giving the fastest
mirror a tight timeout and the slower fallbacks a looser one, so a healthy
primary is never held up waiting on the patience a last resort needs. Discovery
results are cached for several minutes, so redrawing the same polygon costs
Overpass nothing.

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

History reaches back only as far as the forecast endpoint's own archive.
Going further would mean the separate
[Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api),
which is not wired up.

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
come from NIFC's WFIGS service, fetched by your browser. The warnings run after
every analysis whether or not the overlay is switched on, and measure to the
fire perimeter rather than its centroid, because a large fire's centroid can
sit many miles inside its own edge.

WFIGS is the authoritative national dataset and it is **United States only**.
Outside the US the query returns nothing, which draws as an empty overlay and
warns on no rows, and that is indistinguishable from "nothing burning nearby."
Both features are best-effort: if the service is unreachable they go quiet
rather than failing your analysis. Perimeters are a surveyed product with
reporting lag, so read them as where a fire has been mapped, not where it is
burning right now. For decisions about an active incident, use
[InciWeb](https://inciweb.wildfire.gov) and the responsible agency.
