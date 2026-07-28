/**
 * Every third-party service Bluebird's data comes from, in one list.
 *
 * This was written out twice before the public privacy page existed: the
 * control panel's credit line and the privacy dialog's provider sentence,
 * with the README's table as a third prose copy. Two of those are
 * attributions the providers' licenses require, so a list that drifts is a
 * licensing problem rather than a cosmetic one, and adding a third surface
 * without collapsing them first would have made it four.
 *
 * `href` is the attribution target rather than the marketing homepage, which
 * is why OpenStreetMap points at /copyright: that is the page its attribution
 * guidance asks credits to link to.
 *
 * NIFC keeps a second, separate credit on the map itself (App.tsx). That is
 * not a duplicate of this entry — CC BY 3.0 wants the credit wherever the
 * fire data is drawn, not only in a list of sources somewhere else.
 */
export interface DataSource {
  /** Display name, used verbatim wherever the source is credited. */
  name: string
  /** Where the credit links. */
  href: string
  /** What Bluebird takes from it. Rendered by the privacy page. */
  provides: string
  /** Stated only where the source publishes one worth naming. */
  license?: string
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
    provides:
      'Destination names, coordinates, and elevations, queried through the Overpass API.',
    license: 'ODbL',
  },
  {
    name: 'Open-Meteo',
    href: 'https://open-meteo.com',
    provides: 'Hourly precipitation, temperature, and wind forecasts.',
    license: 'CC BY 4.0',
  },
  {
    name: 'CAMS',
    href: 'https://atmosphere.copernicus.eu',
    provides:
      'The atmospheric model behind the air quality figures Open-Meteo returns.',
  },
  {
    name: 'OpenFreeMap',
    href: 'https://openfreemap.org',
    provides: 'The vector tiles the basemap is drawn from.',
  },
  {
    name: 'Nominatim',
    href: 'https://nominatim.org',
    provides: 'Place lookup for the map search box.',
  },
  {
    name: 'NIFC',
    href: 'https://www.nifc.gov',
    provides: 'Active wildfire perimeters for the optional fire overlay.',
    license: 'CC BY 3.0',
  },
]
