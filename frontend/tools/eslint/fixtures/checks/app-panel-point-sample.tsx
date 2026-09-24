// Must trip: the sheet handed the panel's flag, and the table view handed neither.
export const App = ({ pointSample, panelPointSample }: { pointSample: boolean; panelPointSample: boolean }) => (
  <main>
    <ControlPanel pointSample={pointSample} />
    <ResultsSheet pointSample={panelPointSample} />
  </main>
)
