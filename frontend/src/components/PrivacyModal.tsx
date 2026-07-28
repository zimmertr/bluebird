import { useDialog } from '../hooks/useDialog'
import PrivacyBody from './PrivacyBody'
import { BUTTON_PRIMARY, LINK, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  onClose: () => void
}

// The dialog chrome around the shared privacy copy, which lives in PrivacyBody
// so this and the public page at /privacy cannot disagree.
//
// What this file owns beyond the chrome is the way out to that page. The
// dialog answers "what happens to my data" for someone already using the app;
// the page is the one you can paste into an email, and it carries the safety,
// licensing and contact sections this dialog deliberately leaves out. Opening
// it in a new tab keeps a drawn polygon and its results intact.
export default function PrivacyModal({ onClose }: Props) {
  const panelRef = useDialog(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        tabIndex={-1}
        className={`${SURFACE_CARD} w-full max-w-md max-h-[85vh] flex flex-col focus:outline-none`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700 flex-shrink-0">
          <img src="/icon.png" alt="" className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`} />
          <div>
            <h1 id="privacy-title" className={PROSE.title}>Privacy</h1>
            <p className={PROSE.subtitle}>What Bluebird does and doesn't do with your data</p>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <PrivacyBody />

          <p className={`${PROSE.note} mt-4 mb-5`}>
            The full{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className={LINK}>
              privacy and terms page
            </a>{' '}
            adds safety, licensing, and how to reach us.
          </p>

          <button
            onClick={onClose}
            className={`${BUTTON_PRIMARY} flex-shrink-0`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
