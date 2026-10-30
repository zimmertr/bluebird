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
 * answers 404 ({@link DEM_MAXZOOM}). Mapterhorn keeps each request's IP
 * address, referrer and user agent for up to 30 days.
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

/**
 * The deepest zoom the elevation holds over all land, and so the deepest the
 * relief, the contours and the 3D terrain ask for. Mapterhorn serves zooms 0
 * to 12 everywhere it has land, from the 30 m Copernicus fill, and 13 to 17
 * only where a national survey reaches; past that a tile answers 404
 * (measured 2026-10-27: zoom 13 answers over Rainier and 404s over the
 * Sahara, Kazakhstan, the Amazon and the Himalaya; zoom 14 404s over Rainier;
 * 2026-10-29: the Matterhorn answers at every zoom to 17). `tilejson.json`
 * publishes no maxzoom to read this from. At 12 a 404 can only mean open
 * ocean, which has no tile at any zoom; above it a missing survey would leave
 * holes in a `raster-dem` source, which MapLibre cannot fill from the zoom
 * below. MapLibre and the contour library both draw past 12 by stretching the
 * zoom-12 tiles, which at 512px is 19 m a pixel at the equator, finer than the
 * 30 m fill already. The slope angle paints its own tiles and can fall back,
 * so it asks for finer ones (`SLOPE_MAXZOOM` in `map/slope.ts`).
 */
export const DEM_MAXZOOM = 12

/** Mapterhorn's attribution page: the map corner's credit and the slope angle key's both open it. */
export const MAPTERHORN_HREF = 'https://mapterhorn.com/attribution'

/** USGS's NAIP imagery for the United States: 256px JPEG to z16, `{y}` before `{x}`. */
export const USGS_IMAGERY_TILES =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'

/** EOX's Sentinel-2 cloudless mosaic of 2025, worldwide: 256px JPEG, `{y}` before `{x}`. */
export const EOX_IMAGERY_TILES =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'
