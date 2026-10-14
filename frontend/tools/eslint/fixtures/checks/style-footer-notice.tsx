// Must trip: a notice box outside FooterNotice, a status colour in the footer
// body, no FooterNotice at all, no live region, and a portal to somewhere
// other than the phone's band.
export default function PanelFooter() {
  return (
    <div>
      <button onClick={onAnalyze}>Analyze</button>
      <p className={`${NOTICE.warn} ${STATUS.warn}`}>Warning</p>
      {createPortal(<p>Elsewhere</p>, document.body)}
    </div>
  )
}
