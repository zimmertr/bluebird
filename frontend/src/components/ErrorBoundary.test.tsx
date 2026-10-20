import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'
import { render } from '../testSupport/render'

// The linter's `entries-inside-boundary` check pins that every entry renders
// inside it. This file proves the rest through a real render: what the boundary
// draws while nothing fails and after a child throws, that it writes the error
// and the component stack to the console once, and that Try again mounts the
// same children again.

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
    expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('type')).toBe('button')
    expect(screen.queryByText('healthy')).toBeNull()
  })

  // The console is the whole record: no telemetry endpoint exists for the
  // browser, so the stack must reach it. React's own dev log calls
  // console.error too, with a format string first and the error second, so the
  // count is of the calls that lead with the error.
  it('writes the error and the component stack to the console once', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    expect(log).toHaveBeenCalledWith(boom, expect.stringContaining('Thrower'))
    expect(log.mock.calls.filter(([first]) => first === boom)).toHaveLength(1)
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
    const { container } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    )

    // Exactly the children: every entry renders inside the boundary, so a
    // wrapper of its own would stand between the root and every page's layout.
    expect(container.innerHTML).toBe('<p>healthy</p>')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
