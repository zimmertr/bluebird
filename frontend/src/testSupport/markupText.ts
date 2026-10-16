// What a reader reads off markup a test built for setHTML: every tag dropped
// and each run of whitespace one space, for a node test that has no DOM to
// mount it in. It splits on the angle bracket rather than replacing a tag
// pattern, because a pattern replace is what CodeQL reads as an HTML
// sanitizer that a nested tag can get past (#741); this one sanitizes
// nothing and only ever reads markup the app's own builders wrote.
export function markupText(html: string): string {
  return html
    .split('<')
    .map((chunk, i) => (i === 0 ? chunk : chunk.slice(chunk.indexOf('>') + 1)))
    .join('')
    .replace(/\s+/g, ' ')
}
