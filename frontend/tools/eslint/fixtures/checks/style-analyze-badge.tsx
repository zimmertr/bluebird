// Must trip: an Analyze button with no badge, no live region beside it, no
// list to open, and a blocker that disables it instead of greying it.
export default function PanelFooter({ blocked }: { blocked: boolean }) {
  return (
    <button onClick={onAnalyze} disabled={blocked}>
      Analyze
    </button>
  )
}
