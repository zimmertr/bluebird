// Must trip: grip markup and a press clock of App's own, and no ResizeGrip.
const DOUBLE_PRESS_MS = 300
export const Grip = () => <div className={TAP.grip} data-ms={DOUBLE_PRESS_MS} />
