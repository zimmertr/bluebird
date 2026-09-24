// Must trip: an inline function, an empty array, a fresh ?? literal and an element built in the render on a memoized child.
export const App = ({ opts }: { opts?: object }) => (
  <>
    <ResultsTable onPick={() => 1} rows={[]} options={opts ?? {}} />
    <TimeSeriesChart controls={<span />} />
  </>
)
