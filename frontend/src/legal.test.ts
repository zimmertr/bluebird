import { describe, expect, it } from 'vitest'
// @ts-ignore - no types available in browser context
import { readFileSync } from 'fs'
// @ts-ignore - no types available in browser context
import { dirname, join } from 'path'
// @ts-ignore - no types available in browser context
import { fileURLToPath } from 'url'

// `?raw` gives us each file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. Same trick styles.test.ts
// uses to lint components it cannot render.
import app from './App.tsx?raw'
import contactBody from './components/ContactBody.tsx?raw'
import controlPanel from './components/ControlPanel.tsx?raw'
import dataSourceList from './components/DataSourceList.tsx?raw'
import notFoundPage from './components/NotFoundPage.tsx?raw'
import privacyPage from './components/PrivacyPage.tsx?raw'
import safetyNotice from './components/SafetyNotice.tsx?raw'
import termsPage from './components/TermsPage.tsx?raw'
import welcomeModal from './components/WelcomeModal.tsx?raw'
import mapView from './components/MapView.tsx?raw'
import { SUPPORT_EMAIL } from './utils/contact'

// CSS files: vitest stubs CSS imports to empty strings, so read them from the
// filesystem using the same import.meta.url pattern vitest uses internally.
const __dirname = dirname(fileURLToPath(import.meta.url))
const indexCss = readFileSync(join(__dirname, 'index.css'), 'utf-8')
const mapCss = readFileSync(join(__dirname, 'map.css'), 'utf-8')

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
const componentSources = import.meta.glob('./components/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('attribute copy', () => {
  it('found the components', () => {
    expect(Object.keys(componentSources).length).toBeGreaterThan(6)
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
    expect(controlPanel).toMatch(/href="\/privacy"/)
    expect(controlPanel).toMatch(/href="\/terms"/)
  })

  // The failure this replaces: a label that says one thing and navigates
  // somewhere else. A button here means a dialog came back.
  it('are links, not a dialog the app has to hold state for', () => {
    expect(controlPanel).not.toMatch(/onShowPrivacy/)
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
  })

  // CC BY 3.0 asks for this one wherever the fire data is drawn, which is the
  // map rather than a document page. Section 4(b) lets the credit be
  // "implemented in any reasonable manner", so it folded into the swatch's own
  // label; what has to survive a rewrite is that the link is on the map at all
  // and that it names NIFC.
  it('keep NIFC on the map beside the fire overlay', () => {
    expect(app).toMatch(/Active Wildfire/)
    expect(app).toMatch(/https:\/\/data-nifc\.opendata\.arcgis\.com/)
  })

  // Open-Meteo's licence page gives "Weather data by Open-Meteo.com" as an
  // example rather than as required wording, so the bare link stands; what it
  // does require is that the link be beside the data, which is the docked
  // results bar.
  it('keep Open-Meteo beside the forecasts', () => {
    expect(app).toMatch(/https:\/\/open-meteo\.com/)
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
// in layer(base), and MapView imports map.css. A future PR that "simplifies"
// any of these three triggers a test failure rather than silently breaking the
// cascade-layer protection against the historical map-collapse bug.
describe('the map CSS split', () => {
  it('keeps maplibre out of the shared stylesheet', () => {
    expect(indexCss).not.toMatch(/maplibre/)
  })

  it('wraps the maplibre import in layer(base)', () => {
    expect(mapCss).toMatch(/layer\(base\)/)
  })

  it('is imported from MapView, not from TSX anywhere else', () => {
    expect(mapView).toMatch(/import ['"]\.\.\/map\.css['"]/)
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
  // holder, so describing Bluebird itself as a non-commercial project reads as
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

describe('the privacy copy', () => {
  // #169 keyed rate limiting on client address, which made "server logs are
  // used only for debugging" incomplete for as long as it took someone to
  // notice. Pinning the disclosure means a revert fails here rather than
  // shipping a promise Bluebird no longer keeps.
  it('discloses that addresses are used for rate limiting, not only logging', () => {
    const text = copy(privacyPage)

    expect(text).toMatch(/rate limit/i)
    expect(text).toMatch(/in memory/i)
  })

  // #174 moved forecast fetches into the browser while this copy still routed
  // them through the server, the third such drift in a week (#169's rate
  // limiting, #171's license). The request path is now a pinned claim too: the
  // browser talks to Open-Meteo itself, and the server steps in only as the
  // fallback.
  it('describes forecasts as fetched by the browser, with the server as fallback', () => {
    const text = copy(privacyPage)

    expect(text).toMatch(/directly from\s+Open-Meteo/)
    expect(text).toMatch(/server fetches\s+forecasts instead/)
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
