// Must trip: the sheet handed the panel's flag, the results view handed neither, and no flag from reportView.
export const App = ({ pointSample, panelPointSample }: { pointSample: boolean; panelPointSample: boolean }) => (
  <main>
    <ControlPanel pointSample={pointSample} />
    <ResultsSheet pointSample={panelPointSample} />
  </main>
)
