// Must trip: a link at the micro step, the window title in the caption tier, a
// link in the bar, and no button wearing BUTTON_GHOST.
export const Bar = () => (
  <div>
    <button className={`${TEXT.micro} ${LINK}`}>Columns</button>
    <span className={`${TEXT.caption} truncate`}>
      {windowTitle}
    </span>
    <a href="https://open-meteo.com/">Open-Meteo.com</a>
  </div>
)
