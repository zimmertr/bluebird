# Notices

Bluebird itself is licensed under the [PolyForm Noncommercial License
1.0.0](LICENSE). This file credits the third parties it is built on: the
services the data comes from, and the software bundled into the shipped image.

## Data providers

<!-- This section transcribes frontend/src/utils/dataSources.ts, the list the
     privacy and terms pages render. A change to either updates both in the
     same PR. -->

- [OpenStreetMap](https://www.openstreetmap.org/copyright): destination names,
  coordinates, and elevations, queried through the Overpass API. The data is
  © OpenStreetMap contributors, under the
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  Credited in the map's corner attribution control.
- [Open-Meteo](https://open-meteo.com): hourly precipitation, temperature, and
  wind forecasts, under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited beside
  the results whenever forecasts are on screen.
- [CAMS](https://atmosphere.copernicus.eu): the Copernicus Atmosphere
  Monitoring Service, whose model output is the basis of the air quality
  figures. It reaches Bluebird through Open-Meteo's processing, and the
  underlying information is provided under the Copernicus licence.
- [OpenFreeMap](https://openfreemap.org): serves the basemap's vector tiles,
  which are drawn from OpenStreetMap data in the OpenMapTiles schema. The map
  corner credits OpenFreeMap, OpenMapTiles, and OpenStreetMap through the
  attribution the tile metadata declares.
- [Nominatim](https://nominatim.org): place lookup for the map search box. Its
  results derive from OpenStreetMap data, under the same ODbL.
- [NIFC](https://www.nifc.gov): active wildfire perimeters from the WFIGS
  services, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Credited on the map's fire legend whenever fire data is drawn.

## Software

The runtime dependencies bundled into the browser app or installed into the
image. Versions are deliberately absent here: Dependabot moves them weekly,
and licenses change close to never. The exact versions inside any release are
recorded in the SBOM attestation on its image:

```bash
docker buildx imagetools inspect zimmertr/bluebird:<version> --format '{{ json .SBOM }}'
```

Frontend (npm), bundled into the served JavaScript:

| Package | License |
|---|---|
| react, react-dom | MIT |
| maplibre-gl | BSD-3-Clause |
| recharts | MIT |
| lz-string | MIT |

Backend (pip), installed into the image:

| Package | License |
|---|---|
| fastapi | MIT |
| uvicorn | BSD-3-Clause |
| httpx | BSD-3-Clause |
| pydantic | MIT |

Vendored: [swagger-ui-dist](https://www.npmjs.com/package/swagger-ui-dist)
(Apache-2.0), copied into `static/swagger-ui/` at build time so `/docs` loads
nothing from a CDN.

Their transitive dependencies are all under permissive MIT, ISC, and
BSD-family licenses, with two exceptions worth naming: `certifi` (MPL-2.0)
and `typing_extensions` (PSF-2.0). The base image's OS packages are covered
by the SBOM rather than listed here. To regenerate the full listing:

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine \
  sh -c "npm ci && npx --yes license-checker --production --csv"

docker run --rm -v "$PWD/backend":/app -w /app python:3.14-slim \
  sh -c "pip install -q -r requirements.txt pip-licenses && pip-licenses --format=csv"
```
