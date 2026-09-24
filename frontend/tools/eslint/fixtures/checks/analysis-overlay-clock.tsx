// Must trip: two effects, neither keyed on overlay.visible alone, and no composeOverlay.
import { useEffect } from 'react'
export const Card = ({ a, b }: { a: number; b: number }) => {
  useEffect(() => {}, [a])
  useEffect(() => {}, [a, b])
  return null
}
