// Must trip: a re-widthed segment, a spelled page ground, a sized icon, a
// re-sized input, and a layer added to a drag role.
export const segment = `${SEGMENT} p-1 ${ok} w-20`
export const ground = 'min-h-full bg-slate-900'
export const icon = <IconClose className="h-4 text-slate-400" />
export const input = `${ACCENT.input} ml-1 h-3`
export const ghost = `${DRAG_GHOST} ${LAYER.popover}`
