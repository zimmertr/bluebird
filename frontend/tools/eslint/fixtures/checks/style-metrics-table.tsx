// Must trip: a rule in the grid, a Clear filters sized by the panel column and
// drawn whether or not anything is set, and a numeric box off the shape.
export const Table = () => (
  <div className={METRICS_GRID}>
    <input type="number" className="w-12" />
    <div className="border-t" />
    <button onClick={clearFilters} className={CONTROL_W}>
      Clear filters
    </button>
  </div>
)
