import { describe, expect, it } from 'vitest'
import actionsSource from './actions.ts?raw'
import actSource from './act.ts?raw'

// The tutorial (#536) presses the app's real controls, so a control it finds
// by the words on it breaks the step the day the words change, and nothing
// else notices. Every control is found by its `data-tour` marker, or an option
// by the value it stands for. Read as text, because what is held is how the
// source finds things.
const components = import.meta.glob('../components/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// A marker in a component: spelled on the attribute, chosen by a condition
// inside it, or handed to a small component that puts it there.
function wearers(marker: string): string[] {
  const on = new RegExp(`data-tour=(?:"${marker}"|\\{[^}\\n]*'${marker}'[^}\\n]*\\})|\\btour="${marker}"`)
  return Object.entries(components)
    .filter(([path, text]) => !path.includes('.test.') && on.test(text))
    .map(([path]) => path)
}

const named = [
  ...new Set(
    [...actionsSource.matchAll(/(?:area\(stage, |tourSelector\()'([a-z-]+)'/g)].map((m) => m[1]),
  ),
]

describe('what the tutorial presses', () => {
  it('finds no control by its visible words or its spoken name', () => {
    expect(actionsSource).not.toMatch(/\bbyText\b|textContent|aria-label/)
    expect(actSource).not.toMatch(/\bbyText\b/)
  })

  it('names the markers it reaches for', () => {
    expect(named).toEqual(expect.arrayContaining(['draw-start', 'draw-finish', 'window-dates', 'window-hourly', 'model-chip']))
  })

  it.each(named.map((m) => [m]))('finds the %s marker in exactly one component', (marker) => {
    expect(wearers(marker)).toHaveLength(1)
  })
})
