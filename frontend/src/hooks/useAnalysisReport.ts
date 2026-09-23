import { useState } from 'react'
import type { AnalyzeResponse, DestinationResult } from '../types'
import type { AnalyzedView } from './analyzeTypes'

// The committed report and what it was analyzed under: the rows on screen, the
// full field behind them, the snapshot, and the counters surfaces reset on.
// Apart from the run that produces it because it outlives that run: a cancel
// or a failure leaves the report standing.

type Point = { latitude: number; longitude: number }

export function useAnalysisReport() {
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  // The full ranked field behind `response`, before the `limit` cut. Null
  // only before the first committed analysis: since #240 removed the server
  // SSE fallback, every path that commits a report also holds its field.
  const [universe, setUniverse] = useState<DestinationResult[] | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  // True between the first batch landing and the analysis finishing: the rows
  // on screen are a floor, not the report (#337, finding 2). The results bar
  // says "so far" while it holds.
  const [arriving, setArriving] = useState(false)
  // Bumped once per committed analysis. See commit().
  const [analysisSeq, setAnalysisSeq] = useState(0)
  // The wildfire check's field, published the moment discovery settles so the
  // NIFC lookup runs concurrently with the weather fetch instead of after it
  // (TJ, PR #275 review). It is the candidate list, a superset of the
  // committed universe (the bounds and the cap cut later), which is safe:
  // warnings are keyed by coordinate, so an extra point's warning never
  // matches a row. `fireSeq` is the check's own refetch trigger, bumped when
  // the field is published: keying the check on analysisSeq would abort the
  // in-flight lookup at commit and restart it, serial again. Null when the
  // last analysis failed; callers fall back to the committed field.
  const [fireField, setFireField] = useState<Point[] | null>(null)
  const [fireSeq, setFireSeq] = useState(0)

  // `fullField` is required rather than defaulted: a path that cannot supply
  // the full field has to say so at the call site, since silently passing the
  // trimmed rows as the universe is exactly the #177 bug.
  function commit(data: AnalyzeResponse, fullField: DestinationResult[], view: AnalyzedView) {
    setResponse(data)
    setUniverse(fullField)
    setArriving(false)
    setAnalyzed(view)
    // A fresh report, which is not the same event as a fresh row array: live
    // knobs rebuild the rows constantly. Surfaces that reset per report (the
    // table's detail-column sort) key off this rather than off the rows.
    //
    // Deliberately NOT bumped by commitArriving. It restarts the forecast
    // grid's fetch and resets the table's detail sort, and doing either thirty
    // times over one analysis would be a different feature.
    setAnalysisSeq((n) => n + 1)
  }

  // The field so far, while the rest of it is still being fetched (#337).
  // Everything a live knob reads is set; `analysisSeq` is not, for the reason
  // above.
  function commitArriving(data: AnalyzeResponse, fieldSoFar: DestinationResult[], view: AnalyzedView) {
    setResponse(data)
    setUniverse(fieldSoFar)
    setArriving(true)
    setAnalyzed(view)
  }

  // A run ended. The rows that landed stay, but nothing more is coming for
  // them.
  function settle() {
    setArriving(false)
  }

  function publishCandidates(points: Point[]) {
    setFireField(points)
    setFireSeq((n) => n + 1)
  }

  // The published field describes an analysis that will never commit; drop it
  // so the check falls back to the report still on screen.
  function dropCandidates() {
    setFireField(null)
  }

  function clear() {
    setResponse(null)
    setUniverse(null)
    setArriving(false)
    setAnalyzed(null)
    setFireField(null)
  }

  return {
    commit,
    commitArriving,
    settle,
    publishCandidates,
    dropCandidates,
    clear,
    response,
    universe,
    analyzed,
    arriving,
    analysisSeq,
    fireField,
    fireSeq,
  }
}
