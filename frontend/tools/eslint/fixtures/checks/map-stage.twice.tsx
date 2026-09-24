// Must trip: the legend and the button column each rendered twice.
export const Stage = () => (
  <div>
    <MapLegend />
    <MapButtonColumn />
    <MapLegend />
    <MapButtonColumn />
  </div>
)
