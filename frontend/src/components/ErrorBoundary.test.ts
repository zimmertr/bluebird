import { createElement, type ErrorInfo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'
// `?raw` gives each entry's text without executing it, the idiom App.test.ts
// uses for the memo props: an entry calls createRoot on a DOM the node-env
// Vitest has not got, so its wiring is asserted against the source.
import mainSource from '../main.tsx?raw'
import privacySource from '../privacy.tsx?raw'
import termsSource from '../terms.tsx?raw'
import notFoundSource from '../notfound.tsx?raw'

// The server renderer rethrows a render error rather than handing it to a
// boundary, so the catch itself is proved under jsdom in
// `ErrorBoundary.test.tsx`. What is tested here is every part the boundary
// decides: the state a caught error moves it to, what it logs, what it draws in
// each state, and what the button resets.
function boundary(): ErrorBoundary {
  return new ErrorBoundary({ children: createElement('p', null, 'healthy') })
}

function draw(b: ErrorBoundary): string {
  return renderToStaticMarkup(b.render() as Parameters<typeof renderToStaticMarkup>[0])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('draws its children while nothing has failed', () => {
    expect(draw(boundary())).toBe('<p>healthy</p>')
  })

  it('fails over on any caught error', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
  })

  it('draws the approved sentence and one button in place of the children', () => {
    const b = boundary()
    b.state = ErrorBoundary.getDerivedStateFromError()
    const html = draw(b)

    expect(html).toContain('Bluebird Forecast hit an error. Try again later.')
    expect(html).not.toContain('healthy')
    expect(html.match(/<button\b/g)).toHaveLength(1)
    expect(html).toMatch(/<button type="button"[^>]*>Try again<\/button>/)
    expect(html).toContain('role="alert"')
  })

  // The console is the whole record: no telemetry endpoint exists for the
  // browser, so the stack must reach it, and nothing else may be called.
  it('writes the error and the component stack to the console', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')
    const info: ErrorInfo = { componentStack: '\n    at Thrower\n    at App' }

    boundary().componentDidCatch(error, info)

    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(error, info.componentStack)
  })

  it('resets to the children when Try again is pressed', () => {
    const b = boundary()
    const setState = vi.spyOn(b, 'setState').mockImplementation(() => {})

    b.retry()

    expect(setState).toHaveBeenCalledWith({ failed: false })
  })
})

describe('every entry', () => {
  const entries: [string, string, string][] = [
    ['main.tsx', mainSource, 'App'],
    ['privacy.tsx', privacySource, 'PrivacyPage'],
    ['terms.tsx', termsSource, 'TermsPage'],
    ['notfound.tsx', notFoundSource, 'NotFoundPage'],
  ]

  // A page rendered outside the boundary is a page that goes blank again, and
  // an entry added later is a new createRoot this list has to learn about.
  it.each(entries)('%s renders its page inside the boundary', (_file, source, page) => {
    expect(source).toContain("import ErrorBoundary from './components/ErrorBoundary'")
    expect(source).toMatch(
      new RegExp(`<ErrorBoundary>\\s*<${page} />\\s*</ErrorBoundary>`),
    )
    expect(source.match(/createRoot\(/g)).toHaveLength(1)
  })

  it('covers every createRoot in the app', () => {
    const roots = import.meta.glob(['../*.tsx'], { query: '?raw', import: 'default', eager: true })
    const withRoot = Object.entries(roots as Record<string, string>)
      .filter(([, source]) => source.includes('createRoot('))
      .map(([path]) => path.slice('../'.length))
      .sort()
    expect(withRoot).toEqual(entries.map(([file]) => file).sort())
  })
})
