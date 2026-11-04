// Must trip: a notice box, a bare status colour and a live region in the
// coordinates box, and a gutter that lost its flag.
export default function CoordinateBox() {
  return <p role="status" className={`${NOTICE.error} ${STATUS.error}`} />
}
