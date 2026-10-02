// Must trip: a new-tab anchor whose label says nothing about the tab, too few
// anchors to be the results table, and a metric cell link labelled over the
// value it shows, with no description and no Windy sentence to point at.
export const Link = ({ name }: { name: string }) => (
  <a href="https://example.com" target="_blank" aria-label={`Open ${name}.`}>
    x
  </a>
)
export const Cell = ({ value }: { value: string }) => (
  <a href={windyCellUrl(value)} aria-label="Windy">
    {value}
  </a>
)
