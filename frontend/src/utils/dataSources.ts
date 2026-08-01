/**
 * Every third-party service Bluebird's data comes from, in one list.
 *
 * This existed as three prose copies once — a panel credit line, the privacy
 * dialog's provider sentence, the README's table — and a list that drifts is
 * a licensing problem rather than a cosmetic one. Today it renders in exactly
 * one component, DataSourceList, which both document pages share, and
 * NOTICES.md at the repo root transcribes it with the fuller license detail
 * this type does not carry. A change here updates NOTICES.md in the same PR.
 *
 * `href` is the attribution target rather than the marketing homepage, which
 * is why OpenStreetMap points at /copyright: that is the page its attribution
 * guidance asks credits to link to.
 *
 * The credits the licenses place next to the data live outside this list:
 * OpenStreetMap in the map's corner control (delivered by the tile server's
 * TileJSON), Open-Meteo docked beside the results, and NIFC on the fire
 * legend — CC BY 3.0 wants that credit wherever the fire data is drawn, not
 * only in a list of sources somewhere else. Each of those is the creator's
 * name and a link to them, which is the part a license asks to sit beside the
 * data; the license text itself is what `licenseHref` below carries, and this
 * list is the only place in the shipped app it can be read.
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
  /**
   * Where that license's text lives, so the name above is a link rather than a
   * label.
   *
   * Both CC BY versions in this list ask for more than the creator's name. 4.0
   * section 3(a)(1)(C) wants the license indicated and its URI included; 3.0
   * section 4(a) wants a copy of or the URI for the license with every copy,
   * flatly, with none of 4(b)'s "any reasonable manner" latitude. A license
   * name as plain text, which is what this list rendered before, satisfies
   * neither. Only NOTICES.md carried the URIs, and a repo file is not something
   * a visitor is ever served.
   *
   * 4.0 section 3(a)(2) allows satisfying all of it "by providing a URI or
   * hyperlink to a resource that includes the required information", which is
   * what this list becomes once the names link: it renders on /privacy and
   * /terms, and the panel footer offers both from every screen.
   */
  licenseHref?: string
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
    provides:
      'Destination names, coordinates, and elevations, queried through the Overpass API.',
    license: 'ODbL',
    licenseHref: 'https://opendatacommons.org/licenses/odbl/1-0/',
  },
  {
    name: 'Open-Meteo',
    href: 'https://open-meteo.com',
    provides: 'Hourly precipitation, temperature, and wind forecasts.',
    license: 'CC BY 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by/4.0/',
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
    licenseHref: 'https://creativecommons.org/licenses/by/3.0/',
  },
]
