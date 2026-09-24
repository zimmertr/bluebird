import { useEffect, useState } from 'react'
import { decodeAutoAnalyze } from '../utils/urlState'

export interface RunOnOpenInputs {
  /** Whether the live limits have landed (`useCapabilities`). */
  settled: boolean
  /** Writes the queued address now, so the flag leaves the bar before the run spends. */
  flushUrl: () => void
  /** The Analyze click. */
  analyze: () => void | Promise<unknown>
}

/**
 * A link that asks to run its analysis on open (`analyze=1`, #511).
 *
 * The flag is read once at mount like the rest of the link, and cleared the
 * moment it fires, so nothing but this first load can act on it. The URL
 * writer is what takes it out of the address bar, and it can never put it
 * back: `encodeState` cannot write it.
 */
export function useRunOnOpen({ settled, flushUrl, analyze }: RunOnOpenInputs) {
  const [autoAnalyze, setAutoAnalyze] = useState(() => decodeAutoAnalyze(window.location.search))
  // One commit behind `settled` on purpose. The render where the live limits
  // land is the render where the selection and ranking hooks re-clamp the
  // restored model and results cap, in effects whose state reaches the NEXT
  // render. A run fired in that first commit would read the pre-clamp values;
  // this flag is set by an effect in the same commit, so it rises in the render
  // that holds the clamped ones.
  const [capsApplied, setCapsApplied] = useState(false)
  useEffect(() => {
    if (settled) setCapsApplied(true)
  }, [settled])

  // The click, plus making sure the address bar no longer carries the flag,
  // so a reload is an ordinary restore rather than a second spend. The flush
  // is the whole strip. `encodeState` never writes the param, so while the
  // address bar still carries it the URL sync effect can never find it
  // current: a write without it is either already done or still queued, and
  // flushing lands a queued one now instead of up to a debounce later. Going
  // through the writer rather than a history call of its own also keeps any
  // edit already queued, which a direct write of the stripped address would
  // overwrite.
  function runAutoAnalyze() {
    setAutoAnalyze(false)
    flushUrl()
    void analyze()
  }

  return { autoAnalyze, capsApplied, runAutoAnalyze }
}
