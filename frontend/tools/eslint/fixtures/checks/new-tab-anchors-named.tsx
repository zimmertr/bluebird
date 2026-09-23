// Must trip: a new-tab anchor whose label says nothing about the tab, and too
// few anchors to be the results table.
export const Link = ({ name }: { name: string }) => (
  <a href="https://example.com" target="_blank" aria-label={`Open ${name}.`}>
    x
  </a>
)
