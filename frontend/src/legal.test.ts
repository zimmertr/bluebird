import { describe, expect, it } from 'vitest'
// `?raw` gives us each file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. Same trick styles.test.ts
// uses to lint components it cannot render.
import controlPanel from './components/ControlPanel.tsx?raw'
import notFoundPage from './components/NotFoundPage.tsx?raw'
import privacyBody from './components/PrivacyBody.tsx?raw'
import privacyModal from './components/PrivacyModal.tsx?raw'
import privacyPage from './components/PrivacyPage.tsx?raw'
import safetyNotice from './components/SafetyNotice.tsx?raw'
import welcomeModal from './components/WelcomeModal.tsx?raw'
import { SUPPORT_EMAIL } from './utils/contact'

// Comments are not copy, and this repo's comments legitimately use em dashes.
// Only line comments that begin a line are stripped, so the `//` inside an
// https URL survives.
function copy(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PROSE_SOURCES: Record<string, string> = {
  'PrivacyBody.tsx': privacyBody,
  'PrivacyPage.tsx': privacyPage,
  'NotFoundPage.tsx': notFoundPage,
  'SafetyNotice.tsx': safetyNotice,
  'WelcomeModal.tsx': welcomeModal,
}

describe('user-facing copy', () => {
  it.each(Object.entries(PROSE_SOURCES))('%s uses no em or en dashes', (_name, source) => {
    expect(copy(source)).not.toMatch(/[—–]/)
  })
})

// The reason the public page is worth having is that it says what the app
// says. Asserting the shared imports makes that structural rather than a
// promise someone has to keep by re-reading two files.
describe('the page and the app share their copy', () => {
  it('renders one privacy body in both the dialog and the page', () => {
    expect(privacyModal).toMatch(/import PrivacyBody from '\.\/PrivacyBody'/)
    expect(privacyPage).toMatch(/import PrivacyBody from '\.\/PrivacyBody'/)
  })

  it('renders one safety notice in both the welcome dialog and the page', () => {
    expect(welcomeModal).toMatch(/import SafetyNotice from '\.\/SafetyNotice'/)
    expect(privacyPage).toMatch(/import SafetyNotice from '\.\/SafetyNotice'/)
  })

  // Neither surface may restate the copy locally: an inlined sentence would
  // pass the import assertions above while drifting anyway.
  it('keeps the shared sentences out of their callers', () => {
    expect(privacyModal).not.toMatch(/no analytics scripts/)
    expect(privacyPage).not.toMatch(/no analytics scripts/)
    expect(welcomeModal).not.toMatch(/planning aid/)
    expect(privacyPage).not.toMatch(/planning aid/)
  })
})

// #171 relicensed from GPL-3.0 to PolyForm Noncommercial while this page was
// in review, and the page had already shipped the GPL sentence into its terms.
// A license is exactly the kind of claim that is written once and then quietly
// outlived by a decision made in another file, so it gets pinned like the
// privacy claims below.
describe('the license the terms name', () => {
  it('is the one the project actually carries', () => {
    expect(privacyPage).toMatch(/PolyForm Noncommercial License 1\.0\.0/)
    expect(privacyPage).toMatch(/polyformproject\.org/)
  })

  it('does not still claim a license the project has left', () => {
    expect(privacyPage).not.toMatch(/GNU General Public|GPL|gnu\.org/)
  })

  // "Noncommercial" in PolyForm constrains the licensee, not the copyright
  // holder, so describing Bluebird itself as a non-commercial project reads as
  // a promise never to charge, which relicensing deliberately kept open.
  it('does not describe the project itself as non-commercial', () => {
    for (const source of [privacyBody, privacyPage]) {
      expect(copy(source)).not.toMatch(/non-commercial (project|tool)/i)
    }
  })

  // Source-available is not open source, and #171's README is explicit about
  // the distinction. The page must not soften it back.
  it('does not call the project open source', () => {
    expect(copy(privacyPage)).not.toMatch(/\bis open source\b/)
  })
})

describe('the privacy copy', () => {
  // #169 keyed rate limiting on client address, which made "server logs are
  // used only for debugging" incomplete for as long as it took someone to
  // notice. Pinning the disclosure means a revert fails here rather than
  // shipping a promise Bluebird no longer keeps.
  it('discloses that addresses are used for rate limiting, not only logging', () => {
    const text = copy(privacyBody)

    expect(text).toMatch(/rate limit/i)
    expect(text).toMatch(/in memory/i)
  })

  // The other claims that are only true until someone changes behavior. #112
  // would falsify the analytics one; whichever PR does that updates this file
  // and this test together.
  it('still claims no analytics, no cookies, and no accounts', () => {
    const text = copy(privacyBody)

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
    ['PrivacyPage.tsx', privacyPage],
    ['NotFoundPage.tsx', notFoundPage],
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

describe('the public page', () => {
  // The acceptance criterion for #134: reachable from the footer, not only
  // from inside a dialog someone has to know to open.
  it('is linked from the control panel footer', () => {
    expect(controlPanel).toMatch(/href="\/privacy"/)
  })

  it('is linked from the privacy dialog', () => {
    expect(privacyModal).toMatch(/href="\/privacy"/)
  })

  // Separate Vite entries exist so a text page doesn't ship the map. An import
  // reaching into the app tree would undo that quietly, costing a megabyte
  // rather than breaking a build.
  it.each([
    ['PrivacyPage.tsx', privacyPage],
    ['NotFoundPage.tsx', notFoundPage],
  ])('%s pulls nothing from the app tree', (_name, source) => {
    expect(source).not.toMatch(/from '\.\.\/App'/)
    expect(source).not.toMatch(/from '\.\/(App|MapView|ResultsTable|TimeSeriesChart)'/)
    expect(source).not.toMatch(/maplibre|recharts/)
  })
})
