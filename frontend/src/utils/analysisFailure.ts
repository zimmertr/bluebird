import { AnalysisRefusalError } from './clientAnalyze'
import { COVERAGE_MESSAGE_TAIL, OpenMeteoModelCoverage } from './openMeteoErrors'
import type { ForecastModelOption } from '../hooks/useCapabilities'

// What a failed analysis tells the reader. Apart from the hook that runs an
// analysis because the decision is pure: which box a failure lands in, and the
// one sentence it says there.

export type AnalysisFailure =
  // The reader stopped the run. Not an error worth surfacing.
  | { kind: 'cancel' }
  // Deterministic, so it gets the warn box and no retry.
  | { kind: 'refusal'; message: string }
  | { kind: 'error'; message: string }

export function analysisFailure(e: unknown, models: readonly ForecastModelOption[]): AnalysisFailure {
  if (e instanceof DOMException && e.name === 'AbortError') return { kind: 'cancel' }
  if (e instanceof AnalysisRefusalError) return { kind: 'refusal', message: e.message }
  if (e instanceof OpenMeteoModelCoverage) {
    // The label comes from the models list, because only the caller has it.
    const label = models.find((m) => m.id === e.modelId)?.label ?? e.modelId
    return { kind: 'error', message: `${label} ${COVERAGE_MESSAGE_TAIL}` }
  }
  return { kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' }
}
