import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Capabilities, modelForecastHours } from './useCapabilities'
import { DEFAULT_SELECTION, type ForecastSelection, selectionLocalWindow } from '../utils/calendar'
import { isPointSample } from '../utils/forecastWindow'
import { panelWindowMs as toWindowMs, planModelChange, windowWarningFor } from '../utils/forecastSelection'
import type { ShareableState } from '../utils/urlState'

/**
 * The panel's When and Model choices: the forecast window, the model that
 * ranks, the models compared beside it, and the clamp that ties the window to
 * the model's reach.
 *
 * One hook because a model change edits the window: the two cannot be owned
 * apart without handing each other setters. What it does not own is anything
 * about an analysis — the report pins its own window and model, and only
 * `forgetPreClamp` reaches across, because running an analysis retires the
 * pre-clamp memory.
 */
export function useForecastSelection(restored: Partial<ShareableState> | null, caps: Capabilities) {
  // What Analyze asks about: the current hour, or days off the calendar (#166).
  // One value where there used to be four — a mode plus three sets of
  // timestamps, two of them always dormant. Defaults to the current hour: the
  // first question most people arrive with is "where is it clear right now", and
  // it needs no date input, so a fresh load can Analyze without touching Step 2.
  const [selection, setSelection] = useState<ForecastSelection>(
    () => restored?.selection ?? DEFAULT_SELECTION,
  )
  // Which model answers. Restored from the link when one names a model, else
  // the deployment's default. Old links carry no `model=` and inherit it, which
  // can change their numbers: they were computed under Open-Meteo's
  // `best_match` blend. That is a release note rather than something to migrate
  // around — the blend never reported which model it picked, so there is no
  // honest way to reproduce those numbers. The named default is the closest
  // thing to a continuation: `best_match` resolved to GFS at Rainier.
  const [forecastModel, setForecastModel] = useState(
    () => restored?.forecastModel ?? caps.defaultForecastModel,
  )
  // The initializer above runs against the compiled fallback, so adopt the
  // real default once capabilities land — but only when the link named nothing
  // and the user has not chosen, or this would overwrite a deliberate pick a
  // moment after it was made.
  const untouchedModelRef = useRef(restored?.forecastModel === undefined)
  useEffect(() => {
    if (!untouchedModelRef.current) return
    setForecastModel(caps.defaultForecastModel)
  }, [caps.defaultForecastModel])
  // The extra models the chart draws beside the ranking one (#232), in the
  // published order — the picker normalizes it, so this never holds the
  // ranking model and never holds a duplicate. Panel state rather than chart
  // state: the model picker is where it is chosen, and a comparison is bought
  // by the next Analyze like every other model decision, never on load.
  const [comparedModels, setComparedModels] = useState<string[]>(
    () => restored?.compareModels ?? [],
  )
  // The last model change trimmed the forecast window to fit the new model's
  // reach. Held rather than derived because a clamp leaves no trace: afterwards
  // the selection simply is inside the band, and nothing distinguishes a window
  // that was shortened from one that always fitted.
  const [modelClamped, setModelClamped] = useState(false)
  // Both edges of the servable band, from /api/capabilities: the selected
  // model's reach ahead, and the archive's reach back (#123).
  const band = useMemo(
    () => ({
      forecastHours: modelForecastHours(caps.forecastModels, forecastModel),
      pastDays: caps.archiveDays,
      aqiDays: caps.aqiForecastDays,
    }),
    [caps.forecastModels, forecastModel, caps.archiveDays, caps.aqiForecastDays],
  )

  // The window a model clamp took away, held so switching back to a model
  // that can serve it restores it (#242 review). Cleared whenever the user
  // edits the window themselves (their choice supersedes the memory) and once
  // an analysis runs (the report pins the window that was actually asked, and
  // restoring a pre-clamp range after it would silently disagree with what is
  // on screen).
  const preClampSelectionRef = useRef<ForecastSelection | null>(null)

  const changeForecastModel = useCallback(
    (id: string) => {
      untouchedModelRef.current = false
      // The compared set is not touched here. A model is on the chart once
      // whichever way it got there, and which models are selected is the
      // picker's own answer (`utils/modelSelection.ts`), handed over beside this
      // call rather than recomputed from a state this function cannot see.
      // The band as the NEW model leaves it: only the far edge moves with a model.
      const nextBand = { ...band, forecastHours: modelForecastHours(caps.forecastModels, id) }
      const plan = planModelChange(selection, preClampSelectionRef.current, nextBand, new Date())
      preClampSelectionRef.current = plan.remember
      setSelection(plan.selection)
      setModelClamped(plan.clamped)
      setForecastModel(id)
    },
    [band, caps.forecastModels, selection],
  )

  // Any deliberate move of the window retires the clamp notice — it describes
  // one past edit, and leaving it up would attribute the user's own choice to
  // the model picker — and the pre-clamp memory with it, for the same reason.
  const changeSelection = useCallback((next: ForecastSelection) => {
    preClampSelectionRef.current = null
    setModelClamped(false)
    setSelection(next)
  }, [])

  // The report pins the window that was actually asked; a pre-clamp range
  // restored after an analysis would silently disagree with it.
  const forgetPreClamp = useCallback(() => {
    preClampSelectionRef.current = null
  }, [])

  // The selection resolved to the datetime-local pair the rest of the app reads:
  // the horizon and air-quality warnings, the staleness comparison, and the
  // ISO conversion in handleAnalyze. Recomputed per render rather than memoized,
  // since for the current-hour selection it moves with the clock.
  const now = new Date()
  const panelWindow = selectionLocalWindow(selection, now)
  const panelWindowMs = toWindowMs(panelWindow, now)
  // The same question the report's `pointSample` asks, of the panel's When
  // selection. The Metrics table is a panel control, so its aggregate dropdowns
  // must follow a When switch at once, before the switch is analyzed; reading
  // the report's flag froze them to the last analysis (#485).
  const panelPointSample = isPointSample(panelWindowMs.startMs, panelWindowMs.endMs)
  const windowWarning = windowWarningFor(selection, panelWindow, now, band)

  return {
    selection,
    changeSelection,
    forecastModel,
    changeForecastModel,
    comparedModels,
    setComparedModels,
    modelClamped,
    panelWindowMs,
    panelPointSample,
    windowWarning,
    forgetPreClamp,
  }
}
