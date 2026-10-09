import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// The marker popup's grid at its widest, on the widths the card is sized for
// (TJ, 2026-10-08). The unit suites pin the arithmetic against numbers
// measured on macOS (`WIDEST_GRID_PX` in `popupChrome.ts`); this runs the
// built card, rewrites its numbers to the widest each column can print, and
// checks that no family's label wraps and the body never scrolls sideways.
//
// The container's fonts are not the Mac's, so the test first makes them
// measure like it: each number takes the letter-spacing that brings it to the
// Mac's 7.225px a character, and the row labels take the one that brings
// `Precipitation (in/hr)` to its 100.72px (Chrome on macOS, 12px, measured
// 2026-10-08). Per number rather than per face, because the container's
// monospace has no `≥` and draws it from a wider fallback, where the Mac's
// draws it at one character's width. Without this the container's narrower
// monospace would pass a grid that scrolls on a Mac.

const MAC_MONO_CHAR_PX = 7.225
const MAC_WIDEST_LABEL = 'Precipitation (in/hr)'
const MAC_WIDEST_LABEL_PX = 100.72

// The widest number each column can print: a five-digit height in Min and
// Avg, the cloud deck's ceiling bound in Max, and a window total. A stormy
// window's snowfall can reach three digits of inches; a phone narrower than
// 385px holds two (`compactGrid`), and a three-digit one scrolls there, which
// TJ accepted for narrow phones.
const WIDEST = { min: '10,600', max: '≥30,000', avg: '10,600' }

async function openMarkerCard(page: Page) {
  await page.goto('/tutorial')
  const heading = page.locator('[data-tour-card]').getByRole('heading')
  await expect(heading).toHaveText('Destinations')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect(heading).toHaveText('Markers')
  await expect(page.locator('.maplibregl-popup [data-popup-body] table')).toBeVisible()
}

/** Make the fonts measure like the Mac's, and put the widest numbers in. */
async function widenToMac(page: Page, total: string) {
  await page.evaluate(
    ({ monoPx, label, labelPx, widest, total }) => {
      const body = document.querySelector<HTMLElement>('.maplibregl-popup [data-popup-body]')!
      const probe = (text: string, style: string) => {
        const span = document.createElement('span')
        span.style.cssText = style
        span.textContent = text
        body.appendChild(span)
        const w = span.getBoundingClientRect().width
        span.remove()
        return w
      }
      const labelPad = (labelPx - probe(label, 'font-family:sans-serif')) / label.length
      for (const tr of body.querySelectorAll('tr')) {
        const cells = [...tr.querySelectorAll('td')]
        if (!tr.querySelector('th[scope="row"]') || cells.length !== 4) continue
        const texts = [widest.min, widest.max, widest.avg, total]
        cells.forEach((td, i) => {
          const span = td.querySelector('span')
          if (span) span.textContent = texts[i]
        })
      }
      // Through each element's style rather than a stylesheet, which the
      // served Content-Security-Policy refuses.
      for (const el of body.querySelectorAll<HTMLElement>('span[style*="monospace"]')) {
        const chars = [...el.textContent!].length
        el.style.letterSpacing = '0px'
        el.style.letterSpacing = `${(monoPx * chars - el.getBoundingClientRect().width) / chars}px`
      }
      for (const el of body.querySelectorAll<HTMLElement>('th[scope="row"]')) el.style.letterSpacing = `${labelPad}px`
    },
    { monoPx: MAC_MONO_CHAR_PX, label: MAC_WIDEST_LABEL, labelPx: MAC_WIDEST_LABEL_PX, widest: WIDEST, total },
  )
}

async function expectFits(page: Page) {
  const fit = await page.evaluate(({ label, labelPx }) => {
    const body = document.querySelector<HTMLElement>('.maplibregl-popup [data-popup-body]')!
    // The emulation took: the widest label now measures the Mac's width.
    const widest = [...body.querySelectorAll('th[scope="row"]')].find((th) => th.textContent === label)!
    const range = document.createRange()
    range.selectNodeContents(widest)
    const labelWidth = range.getBoundingClientRect().width
    const table = body.querySelector('table')!
    const popup = document.querySelector<HTMLElement>('.maplibregl-popup')!
    const pad = parseFloat(getComputedStyle(body).paddingLeft) + parseFloat(getComputedStyle(body).paddingRight)
    const wrapped = [...body.querySelectorAll('th[scope="row"]')]
      .filter((th) => {
        const range = document.createRange()
        range.selectNodeContents(th)
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1
      })
      .map((th) => th.textContent)
    return {
      labelOff: Math.abs(labelWidth - labelPx),
      wrapped,
      // Exact widths: the card shrinks to its grid, so a rounded clientWidth
      // reads a card already sized to fit, and the cap is what must hold.
      grid: table.getBoundingClientRect().width,
      room: body.getBoundingClientRect().width - pad,
      card: popup.getBoundingClientRect().width,
      cap: parseFloat(popup.style.maxWidth),
      scrolls: body.scrollWidth > body.clientWidth,
    }
  }, { label: MAC_WIDEST_LABEL, labelPx: MAC_WIDEST_LABEL_PX })
  test.info().annotations.push({ type: 'popup grid', description: JSON.stringify(fit) })
  expect(fit.labelOff, JSON.stringify(fit)).toBeLessThan(1)
  expect(fit.wrapped, JSON.stringify(fit)).toEqual([])
  expect(fit.grid, JSON.stringify(fit)).toBeLessThanOrEqual(fit.room)
  expect(fit.card, JSON.stringify(fit)).toBeLessThanOrEqual(fit.cap)
  expect(fit.scrolls, JSON.stringify(fit)).toBe(false)
}

test.describe('on a desktop', () => {
  test('the widest grid fits the card, with a three-digit total', async ({ page }) => {
    await openMarkerCard(page)
    // The demonstration report is ranked, and the card marks that one number.
    await expect(page.locator('[data-popup-body] span[style*="font-weight:700"]')).toHaveCount(1)
    await widenToMac(page, '123.456')
    await expectFits(page)
  })
})

test.describe('on a 360px phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

  test('the widest grid fits the card on compact insets, with a two-digit total', async ({ page }) => {
    await openMarkerCard(page)
    await expect(page.locator('[data-popup-body] th[scope="row"]').first()).toHaveAttribute('style', /padding:1px 6px 1px 0/)
    await widenToMac(page, '12.345')
    await expectFits(page)
  })
})
