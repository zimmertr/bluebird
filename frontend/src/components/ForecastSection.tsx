import { useMemo } from 'react'
import ForecastCalendar from './ForecastCalendar'
import ModelPicker from './ModelPicker'
import { CONTROL_W, TEXT } from '../styles'
import type { ForecastSelection } from '../utils/calendar'
import { modelForecastHours, type ForecastModelOption } from '../hooks/useCapabilities'

interface Props {
  // Which weather model answers, and the set this deployment offers, from
  // /api/capabilities.
  forecastModel: string
  setForecastModel: (id: string) => void
  forecastModels: readonly ForecastModelOption[]
  // The extra models the chart draws beside the ranking one (#232). Ticked in
  // the same list the ranking model is chosen from, because it is the same
  // reading: which model answers, and which others to see it against.
  comparedModels: readonly string[]
  setComparedModels: (ids: string[]) => void
  // Which of them the server would use if asked for none. Marked in the list so
  // a reader who has wandered off it can find the way back; the ordering alone
  // cannot say it, since best-first and default-first need not agree.
  defaultForecastModel: string
  // The selected window is one the archive answers, where no model applies.
  modelDisabled: boolean
  selection: ForecastSelection
  setSelection: (s: ForecastSelection) => void
  // How far back and how far ahead (in air quality) the calendar draws, both
  // published by /api/capabilities.
  archiveDays: number
  aqiForecastDays: number
}

/**
 * The panel's second section: which model answers, and over which hours. It
 * says nothing of its own; every message about the window reads in the one
 * block under the Analyze button.
 */
export default function ForecastSection({
  forecastModel,
  setForecastModel,
  forecastModels,
  comparedModels,
  setComparedModels,
  defaultForecastModel,
  modelDisabled,
  selection,
  setSelection,
  archiveDays,
  aqiForecastDays,
}: Props) {
  const forecastHours = modelForecastHours(forecastModels, forecastModel)
  // Memoized because the calendar's grid hangs off it: a new object on every
  // render would rebuild the month grid on every keystroke in the panel.
  const band = useMemo(
    () => ({ forecastHours, pastDays: archiveDays, aqiDays: aqiForecastDays }),
    [forecastHours, archiveDays, aqiForecastDays],
  )

  return (
    <section>
      <h2 className={`${TEXT.section} mb-2.5`}>
        Forecast
      </h2>

      {/* Above the calendar rather than in Options, because it bounds the
          calendar: the grid below redraws when this changes, and a control
          whose effect is the next control down belongs beside it. A data
          knob either way — sort, limit and the bounds re-present held
          rows, while a different model is different numbers. Ordered longest-reach-first by the server. */}
      <div className="mb-3 flex items-center gap-2">
        {/* Label beside its control, like every other row in the panel.
            The trigger is a button carrying its own aria-label, not an
            input, so this is a span with nothing to point `htmlFor` at.
            A narrow trigger costs the list nothing: popoverBox never
            renders the panel narrower than its trigger and widens it to
            380px regardless. */}
        <span className={`${TEXT.control} flex-1`}>Model</span>
        <div className={`relative ${CONTROL_W}`}>
          {/* A model named by a link but not offered here still has to
              appear, or the control would silently show a different model
              than the one about to be requested. */}
          <ModelPicker
            models={
              forecastModels.some((m) => m.id === forecastModel)
                ? forecastModels
                : [
                    {
                      id: forecastModel,
                      label: forecastModel,
                      summary: '',
                      finestGridKm: 0,
                      forecastHours: 0,
                      regional: false,
                      blend: false,
                    },
                    ...forecastModels,
                  ]
            }
            value={forecastModel}
            defaultId={defaultForecastModel}
            onChange={setForecastModel}
            compared={comparedModels}
            onComparedChange={setComparedModels}
            disabled={modelDisabled}
          />
        </div>
      </div>
      {/* Nothing between the model and the calendar, and nothing under it:
          every message this section has to make lives in the one block
          below the Analyze button (`utils/panelMessages.ts`). */}
      <ForecastCalendar selection={selection} onChange={setSelection} band={band} />
    </section>
  )
}
