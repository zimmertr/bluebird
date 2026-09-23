import type { ReactNode } from 'react'

// The wrapper every results-table cell renders in, header and body alike.
// Apart from both because both read it: auto-fit measures this wrapper in
// every cell of a column, so the header and the rows must draw the same one.

// Every data cell renders inside this wrapper. Sized, it pins the cell's
// content box to the chosen width; unsized it is inert, but it must exist
// either way, because it is what auto-fit measures. Measuring the cell
// itself reads the STRETCHED box (auto layout hands min-w-full's spare
// space to every column), which made the first double-click widen columns
// that already fit their content.
//
// The clipping classes ride ONLY with a width. On an unsized column a
// truncatable block stops defending its content in auto table layout: the
// column can be dealt less than its own header, which then renders
// pre-clipped and makes the first fit look like it widened the column when
// it merely un-clipped it.
export function sized(
  widths: Record<string, number>,
  key: string,
  content: ReactNode,
  display: 'block' | 'inline' = 'block',
): ReactNode {
  const w = widths[key]
  const clip = w !== undefined ? 'overflow-hidden text-ellipsis' : ''
  // Inline for headers: the sort arrow renders BESIDE this wrapper, outside
  // any pinned width, so a column fitted before it was ranked does not clip
  // its own label when the arrow arrives: the column grows by the arrow.
  const flow = display === 'inline' ? 'inline-block align-bottom' : ''
  const className = `${clip} ${flow}`.trim()
  return (
    <div
      data-col-inner
      className={className || undefined}
      style={w !== undefined ? { width: w } : undefined}
    >
      {content}
    </div>
  )
}
