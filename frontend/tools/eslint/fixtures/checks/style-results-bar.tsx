// Must trip: a link at the micro step, and the window title in the caption tier.
export const Bar = () => (
  <div>
    <button className={`${TEXT.micro} ${LINK}`}>Columns</button>
    <span className={`${TEXT.caption} truncate`}>
      {windowTitle}
    </span>
  </div>
)
