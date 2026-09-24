// Must trip: an inline function, an empty array, a fresh ?? literal, an object built here and a spread on a memoized child.
export const Stage = ({ opts, rest }: { opts?: object; rest: object }) => (
  <>
    <ResultsTable onPick={() => 1} rows={[]} options={opts ?? {}} />
    <MapView grid={{ spec: 1 }} {...rest} />
  </>
)
