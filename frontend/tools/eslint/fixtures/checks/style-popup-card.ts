// A popup that hand-rolls its card: a builder that never calls popupCard, with
// a title, a line break and a rule written by hand.
export function probePopupHtml(name: string): string {
  return `<div><strong>${name}</strong><br>Some fact<hr /></div>`
}
