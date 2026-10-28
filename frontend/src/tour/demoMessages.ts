import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { WindowLimits } from '../utils/forecastWindow'
import { blockerOf, type FooterMessage, worstSeverity } from '../utils/notices'
import { panelMessages } from '../utils/panelMessages'

/**
 * The messages the tutorial's Messages card shows (#786). A reader's own may
 * be none at all, or lines that show nothing of what the card says, so the
 * card stands on a fixed pair every time, as the Results card stands on the
 * volcano report (`demoReport.ts`): the reader has named the summits and has
 * yet to pick a day, so Analyze is greyed under a red count, and the window
 * reaches past the air-quality forecast, a line with its ×. One message of
 * each kind the card explains.
 *
 * Both lines come out of `panelMessages`, the one place the app's messages
 * are derived, from inputs that say exactly that, so their words, keys and
 * order are the live ones and nothing here can drift from them.
 */
export function demoMessageList(limits: {
  aqiForecastDays: number
  archiveDays: number
  maxAreaKm2: number
  windowLimits: WindowLimits
}): FooterMessage[] {
  return panelMessages({
    loading: false,
    error: null,
    refusal: null,
    commitReasons: [],
    modelLabel: '',
    modelClamped: false,
    windowWarning: null,
    window: null,
    source: null,
    aqiCoverage: 'partial',
    blockers: ['dates'],
    overCap: null,
    spend: null,
    modelDomain: null,
    ringIgnored: false,
    pointsNeeded: 0,
    freezeGaps: [],
    maxAreaKm2: limits.maxAreaKm2,
    archiveDays: limits.archiveDays,
    aqiForecastDays: limits.aqiForecastDays,
    windowLimits: limits.windowLimits,
    hasReport: false,
    aqiAllNull: false,
    wildfireCheckFailed: false,
    closureCheckFailed: false,
    basemapFailed: false,
    now: new Date(),
  })
}

/**
 * The panel's messages as the app hands them down, with the demonstration in
 * place of the reader's own while the Messages card holds the list (`held`):
 * the pair above, the count and the badge's red from them, and Analyze greyed
 * by the blocker. The rest of the object stays the reader's, so the fields
 * the panel's sections read (the ring's readout, the model picker's state)
 * do not move under the card. A × takes its line out of the demonstration
 * and nowhere else, and the pair comes back whole the next time the card
 * shows. The reader's own messages return when the card moves on.
 */
export function useDemoMessages(
  held: boolean,
  real: PanelMessages,
  limits: Parameters<typeof demoMessageList>[0],
): PanelMessages {
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  useEffect(() => {
    if (!held) setDismissed([])
  }, [held])
  const dismiss = useCallback((key: string) => {
    if (blockerOf(key) === null) setDismissed((was) => [...was, key])
  }, [])
  const { aqiForecastDays, archiveDays, maxAreaKm2, windowLimits } = limits
  const list = useMemo(
    () => demoMessageList({ aqiForecastDays, archiveDays, maxAreaKm2, windowLimits }),
    [aqiForecastDays, archiveDays, maxAreaKm2, windowLimits],
  )
  return useMemo(() => {
    if (!held) return real
    const messages = list.filter((m) => !dismissed.includes(m.key))
    return {
      ...real,
      messages,
      count: messages.length,
      worst: worstSeverity(messages),
      dismiss,
      analyzeEnabled: false,
      blocked: true,
      held: true,
    }
  }, [held, real, list, dismissed, dismiss])
}
