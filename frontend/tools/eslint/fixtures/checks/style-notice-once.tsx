// Must trip: a notice box built outside the list, and the list's own box
// rendered from somewhere else.
export const Panel = () => (
  <div>
    <p className={NOTICE.warn}>Warning</p>
    <MessageBox severity="warn" messages={[]} onDismiss={() => {}} />
  </div>
)
