// Must trip: the drawer closing itself in an effect, and the Metrics table handed the report's flag.
import { useEffect } from 'react'
export function Drawer({ pointSample, close }: { pointSample: boolean; close: () => void }) {
  useEffect(() => close(), [close])
  return <ControlPanel pointSample={pointSample} />
}
