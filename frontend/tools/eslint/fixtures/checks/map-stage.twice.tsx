// Must trip: the legend and the rows each rendered twice.
export const Stage = () => (
  <div>
    <MapLegend />
    <MapRows />
    <MapLegend />
    <MapRows />
  </div>
)
