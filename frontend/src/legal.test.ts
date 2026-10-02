import { describe, expect, it } from 'vitest'
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'fs'
// @ts-expect-error node builtin, untyped in this project
import { dirname, join } from 'path'
// @ts-expect-error node builtin, untyped in this project
import { fileURLToPath } from 'url'

// `?raw` gives us each file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. Same trick styles.test.ts
// uses to lint components it cannot render.
import app from './App.tsx?raw'
import contactBody from './components/ContactBody.tsx?raw'
import controlPanel from './components/ControlPanel.tsx?raw'
import panelFooter from './components/PanelFooter.tsx?raw'
import dataSourceList from './components/DataSourceList.tsx?raw'
import notFoundPage from './components/NotFoundPage.tsx?raw'
import privacyPage from './components/PrivacyPage.tsx?raw'
import safetyNotice from './components/SafetyNotice.tsx?raw'
import termsPage from './components/TermsPage.tsx?raw'
import welcomeModal from './components/WelcomeModal.tsx?raw'
import wildfires from './utils/wildfires.ts?raw'
import mapLegend from './components/MapLegend.tsx?raw'
import resultsBar from './components/ResultsBar.tsx?raw'
import { SUPPORT_EMAIL } from './utils/contact'
import { DATA_SOURCES } from './utils/dataSources'
import { STORAGE_KEY } from './utils/forecastStore'
import forecastStore from './utils/forecastStore.ts?raw'
import { VIEW_KEY, WELCOME_KEY } from './utils/viewPrefs'
import viewPrefs from './utils/viewPrefs.ts?raw'
import { CHUNK_RELOAD_KEY } from './staleChunk'
import mainEntry from './main.tsx?raw'
import mapView from './utils/mapView.ts?raw'
import mapControls from './map/controls.ts?raw'
import geocodeClient from './utils/geocode.ts?raw'

// CSS files: vitest stubs CSS imports to empty strings, so read them from the
// filesystem using the same import.meta.url pattern vitest uses internally.
const __dirname = dirname(fileURLToPath(import.meta.url))
const indexCss = readFileSync(join(__dirname, 'index.css'), 'utf-8')
const mapCss = readFileSync(join(__dirname, 'map.css'), 'utf-8')

// The privacy claims about the server are held to the server's own source.
// The Vitest container mounts the repository root, which is what makes the
// backend readable from here (docs/DEVELOPMENT.md).
function repoFile(path: string): string {
  return readFileSync(join(__dirname, '..', '..', path), 'utf-8')
}

// Comments are not copy, and this repo's comments legitimately use em dashes.
// Only line comments that begin a line are stripped, so the `//` inside an
// https URL survives.
function copy(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PROSE_SOURCES: Record<string, string> = {
  'PrivacyPage.tsx': privacyPage,
  'TermsPage.tsx': termsPage,
  'NotFoundPage.tsx': notFoundPage,
  'ContactBody.tsx': contactBody,
  'DataSourceList.tsx': dataSourceList,
  'SafetyNotice.tsx': safetyNotice,
  'WelcomeModal.tsx': welcomeModal,
}

describe('user-facing copy', () => {
  it.each(Object.entries(PROSE_SOURCES))('%s uses no em or en dashes', (_name, source) => {
    expect(copy(source)).not.toMatch(/[—–]/)
  })
})

// Every component, not just the legal ones, because #175 swept the backend's
// user-facing strings and left the frontend's untouched.
//
// A blanket ban across all of them would be wrong rather than merely strict:
// the results table renders a bare em dash for a missing value and the legend
// and date range use en dashes between numbers, all of which are correct
// typography. Attribute copy has no such ambiguity. Anything inside an
// aria-label, title, placeholder or alt is a sentence read aloud or shown as a
// hint, so a dash in one is always prose. That is exactly where the instance
// #175 missed was hiding, in a screen-reader label nobody reads by eye.
const componentSources = import.meta.glob([
  './components/*.tsx',
  './map/**/*.{ts,tsx}',
  '!./components/*.test.tsx',
  '!./map/**/*.test.{ts,tsx}',
], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('attribute copy', () => {
  it('found the components', () => {
    expect(Object.keys(componentSources).length).toBeGreaterThan(6)
    // The map's modules build popups too, so they are read with the components.
    expect(Object.keys(componentSources)).toContain('./map/basemap.ts')
  })

  it.each(Object.entries(componentSources))('%s uses no dash in a label', (_path, source) => {
    expect(copy(source)).not.toMatch(/(?:aria-label|title|placeholder|alt)="[^"]*[—–]/)
  })
})

// Two pages, two URLs, each one asked for by name. The privacy copy used to
// live in a dialog with a PrivacyBody component shared between it and a
// combined /privacy page; the dialog had no URL, and the "Terms" link beside
// it pointed at the privacy page anyway.
describe('the document pages', () => {
  it('are both reachable from the control panel footer', () => {
    expect(panelFooter).toMatch(/href="\/privacy"/)
    expect(panelFooter).toMatch(/href="\/terms"/)
  })

  // The failure this replaces: a label that says one thing and navigates
  // somewhere else. A button here means a dialog came back.
  it('are links, not a dialog the app has to hold state for', () => {
    expect(controlPanel).not.toMatch(/onShowPrivacy/)
    expect(panelFooter).not.toMatch(/onShowPrivacy/)
    expect(app).not.toMatch(/PrivacyModal|showPrivacy/)
    expect(Object.keys(componentSources)).not.toContain('./components/PrivacyModal.tsx')
    expect(Object.keys(componentSources)).not.toContain('./components/PrivacyBody.tsx')
  })

  // Separate URLs are only worth having if each page answers its own question
  // on its own. Both carry the provider list and a way to get in touch, which
  // is what makes that possible, and neither links the other: someone who
  // followed a terms link wants the terms, not a menu. The footer is the one
  // place both are offered together.
  it.each([
    ['PrivacyPage.tsx', privacyPage, '/terms'],
    ['TermsPage.tsx', termsPage, '/privacy'],
  ])('%s stands alone rather than pointing at its sibling', (_name, source, sibling) => {
    expect(source).toMatch(/import ContactBody from '\.\/ContactBody'/)
    expect(source).toMatch(/import DataSourceList from '\.\/DataSourceList'/)
    expect(copy(source)).not.toMatch(new RegExp(`href="${sibling}"`))
  })

  // Neither may restate shared copy locally: an inlined sentence would pass
  // the import assertions above while drifting anyway.
  it('keeps the shared sentences out of their callers', () => {
    for (const source of [privacyPage, termsPage]) {
      expect(source).not.toMatch(/Each provider's own license and privacy policy/)
    }
    expect(welcomeModal).not.toMatch(/planning aid/)
    expect(termsPage).not.toMatch(/planning aid/)
  })

  it('renders one safety notice in both the welcome dialog and the terms', () => {
    expect(welcomeModal).toMatch(/import SafetyNotice from '\.\/SafetyNotice'/)
    expect(termsPage).toMatch(/import SafetyNotice from '\.\/SafetyNotice'/)
  })
})

// The footer carried its own provider credit line until #135, a third copy of
// dataSources.ts. Every credit a license requires sits beside the data it
// covers instead: OpenStreetMap in the map's corner control (delivered by the
// tile server's TileJSON, not by anything in this repo), Open-Meteo in the
// docked results header, NIFC on the fire legend. The document pages carry the
// full inventory and NOTICES.md transcribes it for the repo. A dataSources
// reference reappearing here means the fourth copy came back.
describe('the provider credits', () => {
  it('stay off the panel footer, which offers only the document pages', () => {
    expect(controlPanel).not.toMatch(/dataSources|DATA_SOURCES/)
    expect(panelFooter).not.toMatch(/dataSources|DATA_SOURCES/)
  })

  // CC BY 3.0 asks for this one wherever the fire data is drawn, which is the
  // map rather than a document page. Section 4(b) lets the credit be
  // "implemented in any reasonable manner", so it folded into the swatch's own
  // label; what has to survive a rewrite is that the link is on the map at all
  // and that it names NIFC.
  //
  // The label is matched as the legend renders it, sentence case included: the
  // capitalised spelling this used to look for survived only in a comment
  // beside the row, so the credit itself could have gone without failing.
  it('keep NIFC on the map beside the fire overlay', () => {
    expect(mapLegend).toMatch(/Active wildfire/)
    // The href is `NIFC_HREF` in `wildfires.ts` since #454, beside the other
    // three overlays' credits in the module that owns each one's data — so
    // what is checked here is that the map's own section still carries it and
    // still names NIFC.
    expect(mapLegend).toMatch(/credit: \{ href: NIFC_HREF, name: 'NIFC' \}/)
    expect(wildfires).toMatch(/https:\/\/data-nifc\.opendata\.arcgis\.com/)
  })

  // Open-Meteo's licence page gives "Weather data by Open-Meteo.com" as an
  // example rather than as required wording, so the bare link stands; what it
  // does require is that the link be beside the data, which is the docked
  // results bar.
  it('keep Open-Meteo beside the forecasts', () => {
    expect(resultsBar).toMatch(/https:\/\/open-meteo\.com/)
  })
})

// The other half of both CC BY licenses. 4.0 section 3(a)(1)(C) wants the
// license indicated and its URI included; 3.0 section 4(a) wants a copy of or
// the URI for the license with every copy, flatly, with none of 4(b)'s
// latitude. Printing the license *name* satisfies neither, and that is all the
// app did — only NOTICES.md carried the URIs, and a repo file is never served
// to a visitor. 4.0 section 3(a)(2) permits satisfying it "by providing a URI
// or hyperlink to a resource that includes the required information", so
// DataSourceList is that resource: both document pages render it, and the panel
// footer offers both from every screen.
describe('the data licenses', () => {
  it('are reachable from inside the app, not only from NOTICES.md', () => {
    expect(dataSourceList).toMatch(/href={source\.licenseHref}/)
  })

  // A URI inlined on a page would pass the assertion above while drifting from
  // the list every other surface reads.
  it('stay in the shared list rather than spelled at a call site', () => {
    for (const source of [privacyPage, termsPage]) {
      expect(copy(source)).not.toMatch(/creativecommons\.org|opendatacommons\.org/)
    }
  })
})

// The map CSS moved out of index.css into map.css, imported only by MapView,
// so text pages don't download 70 KB of map styling they cannot use. Three
// guards keep that split stable: index.css has no maplibre, map.css wraps it
// in layer(base), and MapView imports map.css (the `map-view-wiring` check in
// tools/eslint/checks/map.js). A future PR that "simplifies"
// any of these three triggers a test failure rather than silently breaking the
// cascade-layer protection against the historical map-collapse bug.
describe('the map CSS split', () => {
  it('keeps maplibre out of the shared stylesheet', () => {
    expect(indexCss).not.toMatch(/maplibre/)
  })

  it('wraps the maplibre import in layer(base)', () => {
    expect(mapCss).toMatch(/layer\(base\)/)
  })
})

// #171 relicensed from GPL-3.0 to PolyForm Noncommercial while this page was
// in review, and the copy had already shipped the GPL sentence. A license is
// exactly the kind of claim that is written once and then quietly outlived by
// a decision made in another file, so it gets pinned like the privacy claims
// below.
describe('the license the terms name', () => {
  it('is the one the project actually carries', () => {
    expect(termsPage).toMatch(/PolyForm Noncommercial License 1\.0\.0/)
    expect(termsPage).toMatch(/polyformproject\.org/)
  })

  it('does not still claim a license the project has left', () => {
    expect(termsPage).not.toMatch(/GNU General Public|GPL|gnu\.org/)
  })

  // "Noncommercial" in PolyForm constrains the licensee, not the copyright
  // holder, so describing Bluebird Forecast itself as a non-commercial project reads as
  // a promise never to charge, which relicensing deliberately kept open.
  it('does not describe the project itself as non-commercial', () => {
    for (const source of [privacyPage, termsPage]) {
      expect(copy(source)).not.toMatch(/non-commercial (project|tool)/i)
    }
  })

  // Source-available is not open source, and #171's README is explicit about
  // the distinction. The page must not soften it back.
  it('does not call the project open source', () => {
    expect(copy(termsPage)).not.toMatch(/\bis open source\b/)
  })
})

// The license file the image builds (#571) is only a notice if a reader can
// find it. The terms page is where a license question goes, so it links the
// file from the paragraph that names Bluebird Forecast's own license, through
// the shared link role like every other link on the page.
describe('the third-party software notices', () => {
  it('are linked from the terms', () => {
    const text = copy(termsPage).replace(/\s+/g, ' ')

    expect(text).toMatch(
      /Bluebird Forecast is built on open-source software, and each package keeps its own license\. The full texts are in the/,
    )
    expect(text).toMatch(
      /<a href="\/third-party-licenses\.txt" className=\{LINK\}> third-party licenses <\/a>/,
    )
  })

  // The paragraph changed what the terms say, so the date beneath them moves.
  it('date the terms to the change that added them', () => {
    expect(termsPage).toMatch(/Last updated 1 October 2026\./)
  })
})

describe('the privacy copy', () => {
  // #169 keyed rate limiting on client address, which made "server logs are
  // used only for debugging" incomplete for as long as it took someone to
  // notice. Pinning the disclosure means a revert fails here rather than
  // shipping a promise Bluebird Forecast no longer keeps.
  it('discloses that addresses are used for rate limiting, not only logging', () => {
    const text = copy(privacyPage)

    expect(text).toMatch(/rate limit/i)
    expect(text).toMatch(/in memory/i)
  })

  // #174 moved forecast fetches into the browser while this copy still routed
  // them through the server, the third such drift in a week (#169's rate
  // limiting, #171's license). #240 then removed the server fallback, and this
  // test kept requiring the sentence that described it until #570. The request
  // path is a pinned claim: the browser talks to Open-Meteo itself, and nothing
  // retries through the server.
  it('describes forecasts as fetched by the browser, with no server fallback', () => {
    const text = copy(privacyPage)

    expect(text).toMatch(/directly from\s+Open-Meteo/)
    expect(text).not.toMatch(/server fetches\s+forecasts instead/)
    expect(text).not.toMatch(/cannot reach Open-Meteo, the Bluebird Forecast server/)
    expect(text).not.toMatch(/server to fetch forecasts/)
  })

  // The other claims that are only true until someone changes behavior. #112
  // would falsify the analytics one; whichever PR does that updates this file
  // and this test together.
  it('still claims no analytics, no cookies, and no accounts', () => {
    const text = copy(privacyPage)

    expect(text).toMatch(/no analytics scripts/i)
    expect(text).toMatch(/no cookies/i)
    expect(text).toMatch(/no accounts/i)
  })
})

// #570 found six sentences on these pages that the code had outgrown, each
// falsified by a change in a file nobody connects to a privacy page. Every
// claim below is read against the code that makes it true, so the change that
// falsifies one fails here and brings the page along with it.
describe('the privacy copy, held to the code', () => {
  const text = copy(privacyPage).replace(/\s+/g, ' ')

  // Every module outside the tests, read as text with its comments stripped.
  const appSources = Object.fromEntries(
    Object.entries(
      import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./testSupport/**', '!./**/*.d.ts'], {
        query: '?raw',
        import: 'default',
        eager: true,
      }) as Record<string, string>,
    ).map(([path, source]) => [path, copy(source)]),
  )

  it('dates the policy to the change that last corrected it', () => {
    expect(privacyPage).toMatch(/Last updated 2 October 2026\./)
  })

  // The page names each key by what it keeps, and says how many there are.
  // A new key, or a new module that reaches for browser storage, fails here
  // until the page says what it keeps.
  it('names every key the app keeps in browser storage', () => {
    const storageUsers = Object.entries(appSources)
      .filter(([, source]) => /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b|\bcaches\.open\b/.test(source))
      .map(([path]) => path)
      .sort()
    expect(storageUsers).toEqual(['./main.tsx', './utils/forecastStore.ts', './utils/viewPrefs.ts'])

    const literals = new Set<string>()
    for (const source of Object.values(appSources)) {
      for (const match of source.matchAll(/['"`](bluebird_forecast_[a-z0-9_]+)['"`]/g)) literals.add(match[1])
    }
    const described: Record<string, RegExp> = {
      [WELCOME_KEY]: /local storage keeps whether you dismissed the welcome dialog/,
      [VIEW_KEY]: /how you laid out the results: which views are open, which columns show, and in what order/,
      [STORAGE_KEY]: /Session storage, which ends when you close the tab, keeps the forecasts fetched/,
      [CHUNK_RELOAD_KEY]: /the version of the app that last reloaded itself after an update/,
    }
    expect([...literals].sort()).toEqual(Object.keys(described).sort())
    for (const pattern of Object.values(described)) expect(text).toMatch(pattern)

    const count = ['one', 'two', 'three', 'four', 'five', 'six'].indexOf(
      text.match(/Bluebird Forecast saves (\w+) things and sends none of them anywhere/)?.[1] ?? '',
    ) + 1
    expect(count).toBe(literals.size)

    // Which storage each key lives in is part of the claim: session storage
    // is the half the page says ends with the tab.
    expect(viewPrefs).toMatch(/localStorage\.setItem\(VIEW_KEY/)
    expect(viewPrefs).toMatch(/localStorage\.setItem\(WELCOME_KEY/)
    expect(forecastStore).toMatch(/sessionStorage\?\.setItem\(STORAGE_KEY/)
    expect(mainEntry).toMatch(/reloadOnStaleChunk\(\{[\s\S]*?storage: \(\) => window\.sessionStorage/)
    // The page's "last 15 minutes".
    expect(forecastStore).toMatch(/const CACHE_TTL_MS = 15 \* 60_000/)
  })

  // The browser's own third-party surface is the CSP's list, so the page's
  // list of providers that see your address is read against it. A new origin
  // there fails until this table and the page both name it.
  it('names exactly the providers the browser contacts itself', () => {
    const securityHeaders = repoFile('backend/app/security_headers.py')
    const hosts = new Set<string>()
    for (const block of securityHeaders.matchAll(/BROWSER_(?:FETCH|IMAGE)_ORIGINS = \(([\s\S]*?)\n\)/g)) {
      for (const match of block[1].matchAll(/"https:\/\/([^"]+)"/g)) hosts.add(match[1])
    }
    expect(hosts.size).toBeGreaterThan(0)

    const PROVIDER_BY_HOST: [string, string][] = [
      ['open-meteo.com', 'Open-Meteo'],
      ['openfreemap.org', 'OpenFreeMap'],
      ['mesonet.agron.iastate.edu', 'Iowa Environmental Mesonet'],
      ['mapservices.weather.noaa.gov', 'NOAA NOHRSC'],
    ]
    const expected = new Set<string>()
    for (const host of hosts) {
      const entry = PROVIDER_BY_HOST.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))
      expect(entry, `no provider named for ${host}`).toBeDefined()
      if (entry) expected.add(entry[1])
    }

    const listed = text.match(/Your browser contacts (.+?) itself,/)?.[1]
    expect(listed).toBeDefined()
    const named = (listed ?? '').split(/, | and /).map((name) => name.replace(/^the /, ''))
    expect(new Set(named)).toEqual(expected)
    // The names are the list's own, so a reader can find each one below.
    for (const name of named) expect(DATA_SOURCES.map((s) => s.name)).toContain(name)
  })

  // A geolocate press is a reader move (decision 0065), so the link takes the
  // camera, centered on the fix, and the page address carries it to the
  // server. If either fact changes, so must this paragraph.
  it('says where your location goes after the locate button', () => {
    expect(mapControls).toMatch(/new GeolocateControl\(/)
    expect(mapView).toMatch(/event\.geolocateSource === true/)
    // Nothing asks for a location on its own, which is why the page says a press.
    for (const source of Object.values(appSources)) expect(source).not.toMatch(/\.trigger\(\)/)

    expect(text).toMatch(/only requested when you press the locate button on the map/)
    expect(text).toMatch(/the page's address records that view, which places you to within about 10 meters/)
    expect(text).not.toMatch(/never sent to the Bluebird Forecast server/)
    expect(text).not.toMatch(/when you first open/)
  })

  // The place search is proxied for Nominatim's usage policy, and the route
  // logs the query it proxies.
  it('discloses that a place search goes to the server and into its log', () => {
    expect(geocodeClient).toMatch(/`\/api\/geocode\?/)
    expect(repoFile('backend/app/routes/geocode.py')).toMatch(/log\.info\("Geocode query: %r", q\)/)

    expect(text).toMatch(/A place name you type in the search box goes to the server too/)
    expect(text).toMatch(/Server logs record your IP address with each request to the server's API, and the place names you search for/)
  })

  // "But not the page's address" holds only while the access log prints the
  // path alone: the query string and the Referer header both carry it.
  it('promises an address-free log only while the access log prints the path alone', () => {
    const mainPy = repoFile('backend/app/main.py')
    const accessLog = mainPy.slice(mainPy.indexOf('async def access_log'), mainPy.indexOf('\n\n\n', mainPy.indexOf('async def access_log')))
    expect(accessLog).toMatch(/path = request\.url\.path/)
    expect(accessLog).not.toMatch(/request\.url(?!\.path)|query|referer|request\.headers/i)

    expect(text).toMatch(/but not the page's address or anything else you enter/)
  })

  // A drawn area and a pasted place reach Overpass through a chain of public
  // mirrors, and each mirror is a separate operator who sees that area. A
  // mirror added to the chain fails here until the page names who runs it.
  it('names the operator of every Overpass mirror the server can reach', () => {
    const mirrors = repoFile('backend/app/services/osm/mirrors.py')
    const table = mirrors.slice(mirrors.indexOf('OVERPASS_MIRRORS = ['), mirrors.indexOf('\n]\n', mirrors.indexOf('OVERPASS_MIRRORS = [')))
    const hosts = [...table.matchAll(/url="https:\/\/([^/"]+)\//g)].map((match) => match[1])
    expect(hosts.length).toBeGreaterThan(0)

    const OPERATOR_BY_HOST: Record<string, RegExp> = {
      'overpass-api.de': /one run by FOSSGIS in Germany/,
      'maps.mail.ru': /one run by VK \(maps\.mail\.ru\)/,
    }
    for (const host of hosts) {
      const operator = OPERATOR_BY_HOST[host]
      expect(operator, `no operator named for ${host}`).toBeDefined()
      if (operator) expect(text).toMatch(operator)
    }

    // The sentence counts its servers, so it cannot name fewer than the chain holds.
    const sentence = text.match(/Destination searches are answered by public OpenStreetMap servers: (.+?)\. /)?.[1]
    expect(sentence).toBeDefined()
    expect((sentence ?? '').match(/\bone run by\b/g)?.length).toBe(hosts.length)
  })

  // The page says when the logs go, and that rests on a measurement rather
  // than on code: kubelet rotation never fires at this volume, so a pod's lines
  // last until a release replaces the pod. The record of that measurement is
  // what this sentence answers to, so losing it fails here.
  it('says the logs go with the server update, as the measurement found', () => {
    const traffic = repoFile('docs/TRAFFIC.md').replace(/\s+/g, ' ')
    expect(traffic).toMatch(/## Request logs and how long they last/)
    expect(traffic).toMatch(/pod replacement at a release clears the logs, not rotation/)

    expect(text).toMatch(/They are kept only for debugging and are deleted when the server is next updated, typically within days\./)
    expect(text).not.toMatch(/log rotation/)
  })

  it('names Cloudflare, which carries every request', () => {
    expect(repoFile('docs/TRAFFIC.md')).toMatch(/\*\*Cloudflare\*\* proxies the zone/)

    expect(text).toMatch(/Cloudflare<\/span> carries every request between your browser and the Bluebird Forecast server/)
    expect(copy(privacyPage)).toMatch(/href="https:\/\/www\.cloudflare\.com\/privacypolicy\/"/)
  })
})

// The analyze routes are keyed at the gateway (#317, decision 0025), and the
// header they need is the one the route publishes.
describe('the API terms', () => {
  it('say which endpoints need a key, and whose', () => {
    const text = copy(termsPage).replace(/\s+/g, ' ')

    expect(repoFile('backend/app/routes/analyze/route.py')).toMatch(/API_KEY_HEADER = "X-Open-Meteo-Key"/)
    expect(text).not.toMatch(/needs no key/)
    expect(text).toMatch(/its two analyze endpoints need your own Open-Meteo API key/)
  })
})

describe('the support contact', () => {
  it('is a real address', () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@bluebirdforecast\.com$/)
  })

  // Asserted against the source rather than a rendered page, so it has to
  // match how the source spells it: the constant, never the value. Checking
  // for the interpolated address here would only ever pass if someone had
  // hardcoded it, which is the thing the next test forbids.
  it.each([
    ['ContactBody.tsx', contactBody],
    ['TermsPage.tsx', termsPage],
  ])('%s reaches a human without a GitHub account', (_name, source) => {
    expect(source).toMatch(/href={`mailto:\$\{SUPPORT_EMAIL\}`}/)
  })

  // Anything hardcoded here is an address that outlives the constant it was
  // copied from, and re-pointing the alias is the one thing this indirection
  // buys.
  it.each(Object.entries(PROSE_SOURCES))('%s spells no address of its own', (_name, source) => {
    expect(copy(source)).not.toMatch(/[\w.]+@[\w.]+\.\w+/)
  })
})

describe('the standalone pages', () => {
  // The 404 page is deliberately bare: the fact, the picture, one way back.
  // It had shipped with three paragraphs guessing at what went wrong, a second
  // destination, and an invitation to report a bug, none of which a visitor who
  // mistyped a URL wants. That is a decision nothing else in the codebase
  // records, and it is easy to undo one helpful sentence at a time, so the
  // shape is pinned rather than trusted. Every link the page has comes from the
  // shell around it.
  it('leave the 404 sending people home and nowhere else', () => {
    const markup = copy(notFoundPage)

    expect(markup).not.toMatch(/href=/)
    expect(markup).not.toMatch(/mailto:|github\.com|\/privacy|\/terms/)
  })

  // Separate Vite entries exist so a text page doesn't ship the map. An import
  // reaching into the app tree would undo that quietly, costing a megabyte
  // rather than breaking a build.
  it.each([
    ['PrivacyPage.tsx', privacyPage],
    ['TermsPage.tsx', termsPage],
    ['NotFoundPage.tsx', notFoundPage],
  ])('%s pulls nothing from the app tree', (_name, source) => {
    expect(source).not.toMatch(/from '\.\.\/App'/)
    expect(source).not.toMatch(/from '\.\/(App|MapView|ResultsTable|TimeSeriesChart)'/)
    expect(source).not.toMatch(/maplibre|recharts/)
  })
})
