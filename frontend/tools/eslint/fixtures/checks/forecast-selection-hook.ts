// Must trip: the panel flag read off the report's window, and no effect adopts the default model.
declare const isPointSample: (startMs: number, endMs: number) => boolean
declare const view: { window: { startMs: number; endMs: number } }
export const panelPointSample = isPointSample(view.window.startMs, view.window.endMs)
