// Must trip: an inline function, an empty array and a fresh ?? literal on a memoized child.
export const App = ({ opts }: { opts?: object }) => (
  <ResultsTable onPick={() => 1} rows={[]} options={opts ?? {}} />
)
