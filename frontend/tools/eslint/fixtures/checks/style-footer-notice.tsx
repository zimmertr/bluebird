// Must trip: a notice box outside FooterNotice, a status colour in the footer
// body, and no FooterNotice at all.
export default function PanelFooter() {
  return (
    <div>
      <button onClick={onAnalyze}>Analyze</button>
      <p className={`${NOTICE.warn} ${STATUS.warn}`}>Warning</p>
    </div>
  )
}
