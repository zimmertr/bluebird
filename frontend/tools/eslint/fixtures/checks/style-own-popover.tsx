// Must trip: a panel that positions itself and spells the popover box.
export const Panel = () => (
  <div style={{ position: 'fixed' }} className={`${SURFACE_CARD} ${LAYER.popover} flex`} />
)
