import { ReactNode } from 'react'
import { LINK, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  title: string
  /** Optional: the 404 states the fact and stops, so it passes a title alone. */
  subtitle?: string
  children: ReactNode
}

// A titled block inside a document page, anchored so /terms#license lands
// somewhere useful when the page gets cited in an issue or a reply. Lives here
// with the frame rather than in either page, so /privacy and /terms cannot
// drift into two ideas of what a section looks like.
export function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="mt-6 pt-6 border-t border-slate-700">
      <h2 className={`${PROSE.heading} mb-3`}>{title}</h2>
      {children}
    </section>
  )
}

// The frame all three standalone pages wear: /privacy, /terms and the 404.
// None is the app, so none gets the map's chrome, but they are reading
// surfaces in the same sense the dialogs are and so they wear the same card
// and the same PROSE tier rather than inventing a third look.
//
// Deliberately no router and no shared state with App.tsx: these are separate
// Vite entries, so importing anything from the map's tree would pull maplibre
// into a bundle that renders text.
export default function PageShell({ title, subtitle, children }: Props) {
  return (
    <div className="min-h-dvh bg-slate-900 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" aria-label="Back to Bluebird Forecast">
            <img
              src="/icon.png"
              alt=""
              className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`}
            />
          </a>
          <div>
            <h1 className={PROSE.title}>{title}</h1>
            {subtitle && <p className={PROSE.subtitle}>{subtitle}</p>}
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-6`}>{children}</div>

        <p className={`${PROSE.note} mt-6 text-center`}>
          <a href="/" className={LINK}>
            Back to Bluebird Forecast
          </a>
        </p>
      </div>
    </div>
  )
}
