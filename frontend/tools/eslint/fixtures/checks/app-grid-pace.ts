// Must trip: the grid wait cleared in the repaint, and no chunk loop or failure path.
export function run() {
  function repaint() {
    clearPace()
  }
  repaint()
}
