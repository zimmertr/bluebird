import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import ForecastSection from './ForecastSection'
import { forecastModel } from '../testSupport/fixtures'
import { render } from '../testSupport/render'
import type { FooterMessage } from '../utils/notices'

// The section's own decisions: the model picker stands beside its label and
// fades for an archive window, a model the deployment does not offer still
// shows by name, the calendar sits under the picker with nothing between,
// and a blocker's line stands under the field it is about (record 0208).

const MODELS = [
  forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' }),
  forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
]

type Props = ComponentProps<typeof ForecastSection>

function props(over: Partial<Props> = {}): Props {
  const noop = () => {}
  return {
    forecastModel: 'gfs_seamless',
    setForecastModel: noop,
    forecastModels: MODELS,
    comparedModels: [],
    setComparedModels: noop,
    defaultForecastModel: 'gfs_seamless',
    modelDisabled: false,
    selection: { kind: 'now' },
    setSelection: noop,
    archiveDays: 365,
    aqiForecastDays: 5,
    modelLines: [],
    whenLines: [],
    ...over,
  }
}

const trigger = () => screen.getByRole('button', { name: /^Forecast model:/ })
const MODEL_LINE: FooterMessage = { key: 'blocker:compare-aqi', text: 'Cannot compare.', severity: 'warn' }
const WHEN_LINE: FooterMessage = { key: 'blocker:dates', text: 'Pick a date.', severity: 'info' }

describe('ForecastSection', () => {
  it('names the ranking model and the ones compared with it', () => {
    render(<ForecastSection {...props({ comparedModels: ['ecmwf_ifs025'] })} />)
    expect(trigger().getAttribute('aria-label')).toBe('Forecast model: NOAA GFS +1')
    expect((trigger() as HTMLButtonElement).disabled).toBe(false)
  })

  it('fades the model for a window the archive answers', () => {
    render(<ForecastSection {...props({ modelDisabled: true })} />)
    expect((trigger() as HTMLButtonElement).disabled).toBe(true)
  })

  // A link can name a model this deployment stopped publishing. The picker
  // still shows it, rather than a different model than the one requested.
  it('shows a model the deployment does not offer by its id', () => {
    render(<ForecastSection {...props({ forecastModel: 'retired_model' })} />)
    expect(trigger().getAttribute('aria-label')).toBe('Forecast model: retired_model')
  })

  it('draws the calendar under the picker and no message of its own', () => {
    render(<ForecastSection {...props()} />)
    const calendar = screen.getByRole('button', { name: 'Current' })
    expect(trigger().compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryAllByRole('status')).toEqual([])
    expect(screen.queryByText(/\./)).toBeNull()
  })

  // A blocker about the models stands between the Model row and the
  // calendar; one about the window stands under the When field.
  it('stands a model blocker under the Model row and a window blocker under the When field', () => {
    render(<ForecastSection {...props({ modelLines: [MODEL_LINE], whenLines: [WHEN_LINE] })} />)
    const model = screen.getByText('Cannot compare.')
    const when = screen.getByText('Pick a date.')
    const calendar = screen.getByRole('button', { name: 'Current' })
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(trigger(), model)).toBe(true)
    expect(follows(model, calendar)).toBe(true)
    expect(follows(calendar, when)).toBe(true)
    expect(screen.queryAllByRole('status')).toEqual([])
  })
})
