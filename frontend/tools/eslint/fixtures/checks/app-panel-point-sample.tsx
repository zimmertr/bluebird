// Must trip: the two flags are swapped, and the table view is handed neither.
export const App = ({ pointSample, panelPointSample }: { pointSample: boolean; panelPointSample: boolean }) => (
  <main>
    <ControlPanel pointSample={pointSample} />
    <ResultsSheet pointSample={panelPointSample} />
  </main>
)
