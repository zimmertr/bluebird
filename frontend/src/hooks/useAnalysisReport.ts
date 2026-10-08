import { useRef, useState } from 'react'
import { geoKey } from '../utils/points'
import type { AnalyzeResponse, DestinationResult } from '../types'
import type { AnalyzedView } from './analyzeTypes'

// The committed report and what it was analyzed under: the rows on screen, the
// full field behind them, the snapshot, and the counters surfaces reset on.
// Apart from the run that produces it because it outlives that run: a cancel
// or a failure puts back the report the run began over, exactly.

type Point = { latitude: number; longitude: number }

// What a commit leaves behind, and therefore what a run that does not commit
// puts back.
interface Committed {
  response: AnalyzeResponse | null
  universe: DestinationResult[] | null
  analyzed: AnalyzedView | null
  fireField: Point[] | null
}
const NOTHING_COMMITTED: Committed = { response: null, universe: null, analyzed: null, fireField: null }
// One frozen empty set, so a report with nothing pending hands every reader
// the same value.
const NO_PENDING: ReadonlySet<string> = new Set()

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
  // Bumped when a run that had shown partial rows is discarded. A popup
  // opened over those rows names a row the report put back may not hold, so
  // the map closes every popup on it, as it does on a commit (#577); a run
  // discarded before any row arrived changed nothing on screen and leaves
  // the popups over the standing report open. Apart from `analysisSeq`,
  // which must not move for a run that never committed (#560).
  const [discardSeq, setDiscardSeq] = useState(0)
  // The rows of the committed report, by `geoKey`, whose elevation the run's
  // lookup had not answered when the report committed (#673): their
  // height-read cells tick until `patch` lands the answer. Empty between.
  const [pendingHeights, setPendingHeights] = useState<ReadonlySet<string>>(NO_PENDING)
  // The wildfire check's field, published the moment discovery settles so the
  // NIFC lookup runs concurrently with the weather fetch instead of after it
  // (TJ, PR #275 review). It is the candidate list, a superset of the
  // committed universe (the bounds and the cap cut later), which is safe:
  // warnings are keyed by coordinate, so an extra point's warning never
  // matches a row. `fireSeq` is the check's own refetch trigger, bumped when
  // the field is published: keying the check on analysisSeq would abort the
  // in-flight lookup at commit and restart it, serial again. Null when no
  // analysis has published one; callers fall back to the committed field. The
  // closure check (useClosureProximity, #550) reads the same pair: it is one
  // lookup per analysis over the same candidates, so a second publisher would
  // only be a second answer to which destinations an analysis covers.
  const [fireField, setFireField] = useState<Point[] | null>(null)
  const [fireSeq, setFireSeq] = useState(0)
  // The last committed report, held apart from the state above because the
  // partial rows of a run overwrite that state while it arrives (#337), and a
  // run that does not finish must change nothing (#560): its partial rows
  // would otherwise stand as a report, under a snapshot that let the next
  // Analyze refresh the subset that arrived as if it were the whole field.
  // `publishedRef` is the candidate field last published, which the commit of
  // the run that published it keeps. Refs, because nothing renders from
  // either until `discard` copies them back.
  const committedRef = useRef<Committed>(NOTHING_COMMITTED)
  const publishedRef = useRef<Point[] | null>(null)
  // Whether the run in flight has put partial rows on screen.
  const shownPartialRef = useRef(false)

  // `fullField` is required rather than defaulted: a path that cannot supply
  // the full field has to say so at the call site, since silently passing the
  // trimmed rows as the universe is exactly the #177 bug.
  function commit(
    data: AnalyzeResponse,
    fullField: DestinationResult[],
    view: AnalyzedView,
    pending: ReadonlySet<string> = NO_PENDING,
  ) {
    setResponse(data)
    setUniverse(fullField)
    setArriving(false)
    setAnalyzed(view)
    setPendingHeights(pending)
    committedRef.current = { response: data, universe: fullField, analyzed: view, fireField: publishedRef.current }
    shownPartialRef.current = false
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
    shownPartialRef.current = true
  }

  // A run ended, whatever the outcome: nothing more is coming.
  function settle() {
    setArriving(false)
  }

  // A lookup's answer, landed on the committed report (#673): each row in
  // `rows` replaces the committed row at its coordinate, in the universe and
  // in the response's rows alike, and the snapshot takes the run's view as
  // built again at the patch. The same objects stand everywhere else, so a row the lookup
  // left alone redraws nothing. No sequence moves: the report is the one that
  // committed, with some of its numbers filled in. Answers land a few rows at
  // a time (the tiles, then the pod, then a retry), so only the rows placed
  // stop waiting.
  function patch(rows: readonly DestinationResult[], view: AnalyzedView) {
    const was = committedRef.current
    if (!was.response || !was.universe) return
    const swap = new Map(rows.map((r) => [geoKey(r.latitude, r.longitude), r]))
    const replaced = (list: DestinationResult[]) => list.map((r) => swap.get(geoKey(r.latitude, r.longitude)) ?? r)
    const universe = replaced(was.universe)
    const response = { ...was.response, results: replaced(was.response.results) }
    committedRef.current = { ...was, response, universe, analyzed: view }
    setResponse(response)
    setUniverse(universe)
    setAnalyzed(view)
    setPendingHeights((pending) => {
      if (!pending.size) return pending
      const next = new Set(pending)
      rows.forEach((r) => next.delete(geoKey(r.latitude, r.longitude)))
      return next.size ? next : NO_PENDING
    })
  }

  // The run's own call never answered (an abort, or a reset): nothing is
  // coming from it for the rows that were waiting.
  function settleHeights() {
    setPendingHeights(NO_PENDING)
  }

  function publishCandidates(points: Point[]) {
    publishedRef.current = points
    setFireField(points)
    setFireSeq((n) => n + 1)
  }

  // A run that will never commit: the report it began over goes back on
  // screen as it was, the same objects rather than copies, so every surface
  // keyed on them sees no change at all. Its partial rows go, and so does the
  // candidate field it published, which describes an analysis that does not
  // exist. With no report before it, this is the no-report state.
  // `analysisSeq` never moved for the run, so nothing keyed on it fires.
  function discard() {
    const was = committedRef.current
    publishedRef.current = was.fireField
    setResponse(was.response)
    setUniverse(was.universe)
    setAnalyzed(was.analyzed)
    setArriving(false)
    setFireField(was.fireField)
    // The report put back is the one whose lookup `patch` may still land on,
    // so its pending rows stay as they were.
    if (shownPartialRef.current) setDiscardSeq((n) => n + 1)
    shownPartialRef.current = false
  }

  function clear() {
    committedRef.current = NOTHING_COMMITTED
    publishedRef.current = null
    shownPartialRef.current = false
    setResponse(null)
    setUniverse(null)
    setArriving(false)
    setAnalyzed(null)
    setFireField(null)
    setPendingHeights(NO_PENDING)
  }

  return {
    commit,
    commitArriving,
    settle,
    publishCandidates,
    patch,
    settleHeights,
    discard,
    clear,
    response,
    pendingHeights,
    universe,
    analyzed,
    arriving,
    analysisSeq,
    discardSeq,
    fireField,
    fireSeq,
  }
}
