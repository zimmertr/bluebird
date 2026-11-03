import { useId } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../hooks/useDialog'
import { BUTTON_PRIMARY, DIALOG_FOOT, LAYER, PROSE, SURFACE_CARD } from '../styles'

interface Props {
  /**
   * The question, which names the dialog. Not `title`, which is a tooltip's
   * attribute and which the tooltip count in `styles.test.ts` reads as one.
   */
  question: string
  /** What saying yes does, one sentence. */
  body: string
  /** The yes button's word; the no button is always Cancel. */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A question with two answers, on the welcome dialog's surface (#838, record
 * 0263): the one thing in the app that asks before it discards the reader's
 * work, the Example list field replacing rows a reader typed. The same card,
 * scrim and stacked foot as the welcome dialog, so the app has one dialog
 * look; Escape and the scrim are Cancel (`useDialog`), and the keyboard goes
 * back where it was. Portalled to the body, because it is rendered from
 * inside the panel's scrolling column and a phone's sheet, which a fixed
 * overlay inside a transformed ancestor would stay clipped by.
 */
export default function ConfirmDialog({ question, body, confirmLabel, onConfirm, onCancel }: Props) {
  const panelRef = useDialog(onCancel)
  const questionId = useId()
  return createPortal(
    <div
      className={`fixed inset-0 ${LAYER.modal} flex items-center justify-center bg-scrim/60 backdrop-blur-sm p-4`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={questionId}
        tabIndex={-1}
        className={`${SURFACE_CARD} w-full max-w-sm max-h-full overflow-y-auto focus:outline-none`}
      >
        <div className="px-6 pt-6 pb-4">
          <h2 id={questionId} className={`${PROSE.heading} mb-2`}>
            {question}
          </h2>
          <p className={PROSE.body}>{body}</p>
        </div>
        <div className={DIALOG_FOOT.bar}>
          <button onClick={onConfirm} className={BUTTON_PRIMARY}>
            {confirmLabel}
          </button>
          <button onClick={onCancel} className={DIALOG_FOOT.secondary}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
