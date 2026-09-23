// Must trip: an inline function, an empty array and a fresh ?? literal on a table row.
export const Table = ({ opts }: { opts?: object }) => (
  <tbody>
    <ResultsTableRow onPick={() => 1} rows={[]} options={opts ?? {}} />
    <PendingRow />
  </tbody>
)
