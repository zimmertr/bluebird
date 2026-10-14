import { ReactNode } from 'react'
import { BUTTON_SECONDARY, PROSE, RADIUS, SURFACE_CARD, SURFACE_DIVIDER, SURFACE_PAGE } from '../styles'
import { logoUrl } from '../logo'

interface Props {
  heading: string
  subtitle: string
  children: ReactNode
}

// A titled block inside a document page, anchored so /terms#license lands
// somewhere useful when the page gets cited in an issue or a reply. Lives here
// with the frame rather than in either page, so /privacy and /terms cannot
// drift into two ideas of what a section looks like.
export function Section({
  id,
  heading,
  children,
}: {
  id: string
  heading: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`mt-6 pt-6 border-t ${SURFACE_DIVIDER}`}>
      <h2 className={`${PROSE.heading} mb-3`}>{heading}</h2>
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
export default function PageShell({ heading, subtitle, children }: Props) {
  return (
    <div className={`min-h-dvh ${SURFACE_PAGE} px-4 py-10`}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" aria-label="Back to Bluebird Forecast">
            <img
              src={logoUrl}
              width={256}
              height={256}
              alt=""
              className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`}
            />
          </a>
          <div>
            <h1 className={PROSE.title}>{heading}</h1>
            <p className={PROSE.subtitle}>{subtitle}</p>
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-6`}>{children}</div>

        {/* A button rather than a caption link (#687): it is the page's one
            way back, and the logo above says nothing about being a link. */}
        <div className="mt-6 flex justify-center">
          <a href="/" className={BUTTON_SECONDARY}>
            Back to Bluebird Forecast
          </a>
        </div>
      </div>
    </div>
  )
}
