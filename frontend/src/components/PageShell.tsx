import { ReactNode } from 'react'
import { LINK, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  title: string
  subtitle: string
  children: ReactNode
}

// The frame both standalone pages wear: /privacy and the 404. Neither is the
// app, so neither gets the map's chrome, but they are reading surfaces in the
// same sense the dialogs are and so they wear the same card and the same PROSE
// tier rather than inventing a third look.
//
// Deliberately no router and no shared state with App.tsx: these are separate
// Vite entries, so importing anything from the map's tree would pull maplibre
// into a bundle that renders text.
export default function PageShell({ title, subtitle, children }: Props) {
  return (
    <div className="min-h-dvh bg-slate-900 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" aria-label="Back to Bluebird">
            <img
              src="/icon.png"
              alt=""
              className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`}
            />
          </a>
          <div>
            <h1 className={PROSE.title}>{title}</h1>
            <p className={PROSE.subtitle}>{subtitle}</p>
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-6`}>{children}</div>

        <p className={`${PROSE.note} mt-6 text-center`}>
          <a href="/" className={LINK}>
            Back to the map
          </a>
        </p>
      </div>
    </div>
  )
}
