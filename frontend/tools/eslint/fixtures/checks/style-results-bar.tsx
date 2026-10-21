// Must trip: a link at the micro step, the window title in the caption tier, a
// link in the bar, no Download CSV on ACTION_ITEM, no menu buttons in the bar
// shape, no ACTION_GROUP, and no word wearing BAR_LABEL.
export const Bar = () => (
  <div>
    <button className={`${TEXT.micro} ${LINK}`}>Columns</button>
    <span className={`${TEXT.caption} truncate`}>
      {windowTitle}
    </span>
    <a href="https://open-meteo.com/">Open-Meteo.com</a>
  </div>
)
