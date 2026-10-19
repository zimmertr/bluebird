import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import DataSourceList from './DataSourceList'
import { render } from '../testSupport/render'
import { DATA_SOURCES } from '../utils/dataSources'

// This list is the only place in the shipped app a data license's URI is
// served, which is what the CC BY terms ask for, so the link is the behavior.
describe('DataSourceList', () => {
  it("links each licensed source's license to its text, and leaves a source with no license bare", () => {
    render(<DataSourceList />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(DATA_SOURCES.length)
    const licensed = DATA_SOURCES.filter((s) => s.license)
    const bare = DATA_SOURCES.filter((s) => !s.license)
    // Both arms must be on the list, or this test checks one of them.
    expect(licensed.length).toBeGreaterThan(0)
    expect(bare.length).toBeGreaterThan(0)

    DATA_SOURCES.forEach((source, i) => {
      const item = items[i]
      const credit = item.querySelector('a')
      expect(credit?.textContent).toBe(source.name)
      expect(credit?.getAttribute('href')).toBe(source.href)
      if (source.license) {
        const license = [...item.querySelectorAll('a')].find((a) => a.textContent === source.license)
        expect(license?.getAttribute('href')).toBe(source.licenseHref)
        expect(item.textContent).toBe(`${source.name} (${source.license}). ${source.provides}`)
      } else {
        expect(item.querySelectorAll('a')).toHaveLength(1)
        expect(item.textContent).toBe(`${source.name}. ${source.provides}`)
      }
    })
  })
})
