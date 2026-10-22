// Must trip: a notice box outside MessageBox, a status colour in the list
// body, a live region of its own, no MessageBox at all, no <MessageBox>
// rendered, and no Menu under the list.
export default function MessageList() {
  return (
    <div role="status" className={`${NOTICE.warn} ${STATUS.warn}`}>
      Warning
    </div>
  )
}
