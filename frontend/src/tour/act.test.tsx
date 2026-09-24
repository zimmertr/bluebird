import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useState } from 'react'
import type { SandboxHandle } from '../hooks/useTour'
import { Stale, type Stage, byText, find, setValue, sleep } from './act'

afterEach(() => {
  document.body.innerHTML = ''
})

function stageOver(root: HTMLElement, readerRoot: HTMLElement, alive = () => true): Stage {
  return {
    root,
    readerRoot,
    handle: () => ({}) as SandboxHandle,
    alive,
    reduced: true,
    pointer: { glide: async () => {}, press: () => {}, hide: () => {}, remove: () => {} },
    light: () => {},
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

describe('byText', () => {
  it('matches a button by its whole label', () => {
    document.body.innerHTML = '<div><button>Draw polygon</button><button>Done</button></div>'
    expect(byText(document.body, 'button', 'Done')?.textContent).toBe('Done')
    expect(byText(document.body, 'button', 'Don')).toBeNull()
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
})
