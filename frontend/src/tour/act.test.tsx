import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useState } from 'react'
import type { SandboxHandle } from '../hooks/useTour'
import { Stale, type Stage, find, setValue, sleep } from './act'

afterEach(() => {
  document.body.innerHTML = ''
})

function stageOver(root: HTMLElement, readerRoot: HTMLElement, alive = () => true): Stage {
  return {
    root,
    readerRoot,
    handle: () => ({}) as SandboxHandle,
    alive,
    instant: () => true,
    hurried: new Promise(() => {}),
    pointer: { glide: async () => {}, press: () => {}, hide: () => {}, remove: () => {} },
    light: () => {},
    card: () => null,
    freeMap: () => null,
  }
}

// The tutorial (#536) stands its demo copy of the app beside the reader's,
// hidden one, so every control is in the page twice.
describe('find', () => {
  function page() {
    document.body.innerHTML =
      '<div id="root"><div data-tour="model">reader</div><div role="listbox">reader list</div></div>' +
      '<div id="demo"><div data-tour="model">demo</div></div>' +
      '<div role="listbox">demo list</div>'
    return stageOver(document.getElementById('demo')!, document.getElementById('root')!)
  }

  it('finds the demo\'s control, never the reader\'s', () => {
    expect(find(page(), '[data-tour="model"]')?.textContent).toBe('demo')
  })

  it('finds a panel the demo portaled out of its own tree, and not the reader\'s', () => {
    expect(find(page(), '[role="listbox"]')?.textContent).toBe('demo list')
  })
})

describe('setValue', () => {
  it('reaches a controlled field\'s onChange', () => {
    const seen = vi.fn()
    function Field() {
      const [value, setV] = useState('')
      return (
        <input
          value={value}
          onChange={(e) => {
            seen(e.target.value)
            setV(e.target.value)
          }}
        />
      )
    }
    const { container } = render(<Field />)
    setValue(container.querySelector('input')!, 'Glacier Peak')
    expect(seen).toHaveBeenCalledWith('Glacier Peak')
  })
})

describe('sleep', () => {
  it('stops an action whose step the reader has left', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="demo"></div>'
    const stage = stageOver(document.getElementById('demo')!, document.getElementById('root')!, () => false)
    await expect(sleep(stage, 10)).rejects.toBeInstanceOf(Stale)
  })

  // Next pressed while a step plays finishes it where it was going: every
  // wait in the action ends the moment the reader hurries.
  it('ends early when the reader hurries the step', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="demo"></div>'
    let hurry = () => {}
    const stage = {
      ...stageOver(document.getElementById('demo')!, document.getElementById('root')!),
      instant: () => false,
      hurried: new Promise<void>((resolve) => (hurry = resolve)),
    }
    const started = performance.now()
    const waiting = sleep(stage, 10_000)
    hurry()
    await waiting
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
