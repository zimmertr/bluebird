// Must trip: an effect, the button column before the legend, and no overlay, popover or player.
import { useEffect } from 'react'
export const Stage = () => {
  useEffect(() => {}, [])
  return (
    <div>
      <MapButtonColumn />
      <MapLegend />
    </div>
  )
}
