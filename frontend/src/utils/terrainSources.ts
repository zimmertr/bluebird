/**
 * Where the map's ground layers come from (#799): one elevation model behind
 * the contours, the shaded relief and the 3D terrain, and two imagery sources
 * behind the satellite layer. The browser fetches every tile itself, keyless,
 * so each host here is in the CSP's connect-src and img-src
 * (`backend/app/security_headers.py`).
 *
 * The elevation is Mapterhorn's: Terrarium-encoded WebP tiles, 512px, so a
 * source that reads them declares `encoding: 'terrarium'` and `tileSize: 512`.
 * Its data is credited per source, mostly CC BY 4.0 and US public domain, with
 * Copernicus GLO-30 (30m) as the fill wherever no finer national survey
 * exists; its attribution page is mapterhorn.com/attribution, and the credit it
 * asks for is "© Mapterhorn". Past the zoom a region's survey reaches, a tile
 * answers 404, so a source caps its maxzoom (12 holds everywhere; finer is a
 * per-region decision the drawing phase makes). Mapterhorn keeps each
 * request's IP address, referrer and user agent for up to 30 days.
 *
 * The imagery is a composite. USGS's is NAIP aerial photography for the
 * United States and its territories, in the public domain, 256px JPEG to z16,
 * and a 404 outside that coverage. EOX's is the Sentinel-2 cloudless mosaic,
 * 10m, 256px JPEG, worldwide, under CC BY-NC-SA 4.0 for the 2018 and later
 * vintages, which is the license that binds this one. Both address a tile
 * row before column, `{z}/{y}/{x}`, where the elevation is `{z}/{x}/{y}`, and
 * a template with the two swapped asks for some other tile.
 */

/** Mapterhorn's elevation tiles: Terrarium encoding, 512px WebP. */
export const DEM_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'

/** USGS's NAIP imagery for the United States: 256px JPEG to z16, `{y}` before `{x}`. */
export const USGS_IMAGERY_TILES =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'

/** EOX's Sentinel-2 cloudless mosaic of 2025, worldwide: 256px JPEG, `{y}` before `{x}`. */
export const EOX_IMAGERY_TILES =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'
