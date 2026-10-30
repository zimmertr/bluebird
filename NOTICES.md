# Notices

Bluebird Forecast itself is licensed under the [PolyForm Noncommercial License
1.0.0](LICENSE). This file credits the third parties it is built on: the
services the data comes from, and the software bundled into the shipped image.

## Data providers

<!-- The list below transcribes frontend/src/utils/dataSources.ts, the list
     the privacy and terms pages render. A change to either updates both in the
     same PR. Bundled data, after it, is the repo's alone. -->

- [OpenStreetMap](https://www.openstreetmap.org/copyright): destination names,
  coordinates, and elevations, from a copy the server keeps current daily, or
  the Overpass API when that copy cannot answer. The data is
  © OpenStreetMap contributors, under the
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  Credited in the map's corner attribution control, and below the data in
  every exported CSV, because a ranked table of OSM places is a derived
  product that leaves the screen the credit sits on.
- [Open-Meteo](https://open-meteo.com): hourly precipitation, temperature, and
  wind forecasts, under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited in the
  map's corner attribution control, which is on screen whenever forecasts are,
  and below the data in every exported CSV, because 4.0 §3(a)(1)(C) asks the credit to accompany every
  copy of the material.
- [CAMS](https://atmosphere.copernicus.eu): the Copernicus Atmosphere
  Monitoring Service, whose model output is the basis of the air quality
  figures. It reaches Bluebird Forecast through Open-Meteo's processing, and the
  underlying information is provided under the Copernicus licence.
- [ERA5](https://climate.copernicus.eu): the Copernicus Climate Change
  Service's reanalysis, the basis of the weather figures Open-Meteo's archive
  returns for past dates. It reaches Bluebird Forecast through Open-Meteo's
  processing, and the underlying information is provided under the Copernicus
  licence.
- [OpenFreeMap](https://openfreemap.org): serves the basemap's vector tiles,
  which are drawn from OpenStreetMap data in the OpenMapTiles schema, and
  which the app also reads for the glaciers the snow card names. The map
  corner credits OpenFreeMap, OpenMapTiles, and OpenStreetMap
  through the attribution the tile metadata declares.
- [Mapterhorn](https://mapterhorn.com/attribution): elevation tiles for the
  optional contours, shaded relief and 3D terrain. The data is licensed per
  source, mostly under CC BY 4.0 or in the US public domain, with Copernicus
  GLO-30 as the worldwide fill, and Mapterhorn's attribution page lists each
  one. The credit it asks for is `© Mapterhorn`, linked to that page.
  Mapterhorn keeps each request's IP address, referrer and user agent for up
  to 30 days, under its own privacy policy.
- [USGS The National Map](https://www.usgs.gov/programs/national-geospatial-program/national-map):
  aerial imagery of the United States, for the optional satellite layer. A
  work of the US government, and so in the public domain under 17 U.S.C. §105.
  The credit USGS asks for is "Map services and data available from U.S.
  Geological Survey, National Geospatial Program."
- [EOX IT Services](https://s2maps.eu): Sentinel-2 cloudless imagery outside
  the United States, for the optional satellite layer, under
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), which
  covers every yearly mosaic from 2018 on. The credit it asks for is
  "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains
  modified Copernicus Sentinel data 2025)".
- [Nominatim](https://nominatim.org): place lookup for the map search box. Its
  results derive from OpenStreetMap data, under the same ODbL.
- [NIFC](https://www.nifc.gov): active wildfire perimeters from the WFIGS
  services, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Credited on the map's fire legend whenever fire data is drawn, and in an
  exported CSV whenever the file carries the wildfire column.
- [NASA FIRMS](https://earthdata.nasa.gov/firms): active fire detections from
  the VIIRS instruments on NOAA-20 and NOAA-21 and the MODIS instruments on
  Terra and Aqua, for the optional fire activity layer. The server fetches
  them, so the browser never contacts FIRMS. NASA data is free to use with no
  restriction, and FIRMS asks to be acknowledged in these words: "We
  acknowledge the use of data and/or imagery from NASA's Fire Information for
  Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part
  of NASA's Earth Science Data and Information System (ESDIS)." Credited on the
  map's fire activity legend whenever detections are drawn.
- [NOAA HMS](https://www.ospo.noaa.gov/Products/land/hms.html): smoke plumes
  traced from GOES imagery by analysts at the Hazard Mapping System. A work of
  the US government, and so in the public domain under 17 U.S.C. §105; no
  license names Bluebird Forecast's use of it. Credited on the map's smoke legend
  whenever smoke is drawn.
- [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/ogc/): NEXRAD
  base-reflectivity mosaic tiles, generated by Iowa State University from
  National Weather Service radar data. Served without a license statement and
  asked only to be credited; IEM asks that applications with thousands of
  simultaneous users arrange their own hosting. Credited on the map's radar
  legend whenever radar is drawn.
- [NOAA NOHRSC](https://www.nohrsc.noaa.gov/nsa/): snow depth from the National
  Operational Hydrologic Remote Sensing Center's National Snow Analysis, served
  as rendered map images by the National Weather Service for the optional snow
  overlay. A work of the US government, and so in the public domain under
  17 U.S.C. §105; no license names Bluebird Forecast's use of it. Credited on
  the map's snow legend whenever snow depth is drawn.
- [US Forest Service](https://www.fs.usda.gov/): closure orders from the Forest
  Service's Pacific Northwest, Southwestern and Intermountain regions, for the
  optional closure layers and the closure column. A
  work of the US government, and so in the public domain under 17 U.S.C. §105;
  no license names Bluebird Forecast's use of it. Credited on the map's area and
  trail closure legends whenever closures are drawn.

### Bundled data

Data built into the app rather than fetched from its source, so it is not in
the list above or on the privacy and terms pages: the browser never contacts
these providers.

- [US Census Bureau](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html):
  the state outlines that name a crag's state in its Mountain Project search,
  simplified from the 2024 cartographic boundary files by
  `frontend/tools/us-states/build.sh` and served by the pod. A work of the US
  government, and so in the public domain under 17 U.S.C. §105.

## Software

The runtime dependencies bundled into the browser app or installed into the
image. This section is a summary. The complete list, with every package's
version and its full license text, is built into each image and served at
[`/third-party-licenses.txt`](https://bluebirdforecast.com/third-party-licenses.txt);
the build writes it from what it actually bundled and installed, and fails when
a package has no license text to copy. Swagger UI's own `LICENSE`, `NOTICE`
and `swagger-ui-bundle.js.LICENSE.txt` ship beside it under `/swagger-ui/`.

Versions are deliberately absent here: Dependabot moves them weekly, and
licenses change close to never. The exact versions inside any release are in
that file, and in the SBOM attestation on its image:

```bash
docker buildx imagetools inspect zimmertr/bluebird:<version> --format '{{ json .SBOM }}'
```

<!-- backend/tests/test_notices.py holds the two tables below to
     frontend/package.json's dependencies and backend/requirements.in, in
     both directions, and each license cell to the license the package
     declares. A new direct dependency fails it until it has a row. -->

Frontend (npm), bundled into the served JavaScript:

| Package | License |
|---|---|
| react, react-dom | MIT |
| maplibre-gl | BSD-3-Clause |
| maplibre-contour | BSD-3-Clause |
| recharts | MIT |
| lz-string | MIT |
| @mapbox/vector-tile | BSD-3-Clause |
| pbf | BSD-3-Clause |

The stylesheet is generated at build time by [tailwindcss](https://www.npmjs.com/package/tailwindcss) (MIT), whose preflight rules ship in it.

Backend (pip), installed into the image:

| Package | License |
|---|---|
| fastapi | MIT |
| uvicorn | BSD-3-Clause |
| httptools | MIT |
| uvloop | MIT License |
| httpx | BSD-3-Clause |
| pydantic | MIT |
| prometheus-client | Apache-2.0 AND BSD-2-Clause |
| psycopg | LGPL-3.0-only |
| psycopg-pool | LGPL-3.0-only |

Vendored: [swagger-ui-dist](https://www.npmjs.com/package/swagger-ui-dist)
(Apache-2.0), copied into `static/swagger-ui/` at build time so `/docs` loads
nothing from a CDN.

Their transitive dependencies are all under permissive MIT, ISC, and
BSD-family licenses, with three exceptions worth naming: `certifi` (MPL-2.0),
`typing_extensions` (PSF-2.0), and `psycopg-binary` (LGPL-3.0-only), the
build of psycopg that carries its own copy of PostgreSQL's client library. `victory-vendor` (MIT AND ISC, through
recharts) ships no license file of its own, so its text is copied from the
Victory repository into `frontend/plugins/licenses/`. The base image's OS
packages and the Python interpreter are covered by the SBOM and by the base
image's own files rather than listed here. To read the full listing from a
local build:

```bash
docker build -t bluebird-forecast:local .
docker run --rm bluebird-forecast:local cat static/third-party-licenses.txt
```

The planet fill is a second image, `zimmertr/bluebird-fill` (#760). Its
software is Debian's own packages on `trixie-slim`, each with its license text
in the image at `/usr/share/doc/<package>/copyright`, so it carries no
`third-party-licenses.txt`. The release attaches an SBOM to this image too:

| Package | License |
|---|---|
| osmium-tool | GPL-3.0-or-later |
| python3-pyosmium | BSD-2-Clause |
| python3-psycopg2 | LGPL-3.0-or-later, with an exception for linking OpenSSL |

The libraries they load come from Debian the same way, `libpq5` (PostgreSQL
License) among them, with their texts in the same place. `fill.py` and the `rules.py`
it reads are this repository's code under its license, which the image
carries as `/app/LICENSE`. To read a package's text from a local build:

```bash
docker build -f fill/Dockerfile -t bluebird-fill:local .
docker run --rm --entrypoint cat bluebird-fill:local /usr/share/doc/osmium-tool/copyright
```
