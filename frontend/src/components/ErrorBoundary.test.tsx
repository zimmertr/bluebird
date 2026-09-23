import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'
import { render } from '../testSupport/render'

// The catch itself, which only a real render can prove: `ErrorBoundary.test.ts`
// tests the parts the boundary decides and pins every entry's wiring, and this
// file proves React hands a render error to it and that Try again mounts the
// children again.

// A child whose failure the test switches off, so a retry can show that the
// same children come back rather than the fallback drawing itself again.
const failure = { on: true }
const boom = new Error('render failed')

function Thrower() {
  if (failure.on) throw boom
  return <p>healthy</p>
}

afterEach(() => {
  failure.on = true
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('draws the approved sentence and one button when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert').querySelector('p')?.textContent).toBe(
      'Bluebird Forecast hit an error. Try again later.',
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('healthy')).toBeNull()
  })

  it('writes the error and the component stack to the console', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    expect(log).toHaveBeenCalledWith(boom, expect.stringContaining('Thrower'))
  })

  it('mounts the children again when Try again is pressed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    failure.on = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('healthy')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('draws the children and nothing else while nothing fails', () => {
    failure.on = false
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    expect(screen.getByText('healthy')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
