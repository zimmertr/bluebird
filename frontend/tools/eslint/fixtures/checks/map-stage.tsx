// Must trip: an effect, and no overlay, legend, rows, foot, popover or player.
import { useEffect } from 'react'
export const Stage = () => {
  useEffect(() => {}, [])
  return <div />
}
