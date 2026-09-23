// Must trip: the two flags are swapped, and no effect resets the widths.
export const App = ({ pointSample, panelPointSample }: { pointSample: boolean; panelPointSample: boolean }) => (
  <main>
    <ControlPanel pointSample={pointSample} />
    <ResultsTable pointSample={panelPointSample} />
  </main>
)
