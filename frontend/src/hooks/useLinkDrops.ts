import { useEffect, useMemo, useState } from 'react'
import type { LinkDrop } from '../utils/urlState'

export interface LinkDropInputs {
  /** What the link carried and its decoder could not restore (`decodeLink`). */
  dropped: readonly LinkDrop[]
  /** The reader has a ring of their own now. */
  ring: boolean
  /** The reader has a list of their own now. */
  list: boolean
  /** The link's ranking model is not one the deployment offers (`useForecastSelection`). */
  modelLost: boolean
}

/**
 * What a share link carried and could not restore, for as long as it is still
 * the question (#803, M6): a ring and a pasted list the decoder dropped, and a
 * ranking model the deployment does not offer. The panel says one info line
 * for each (`panelMessages`).
 *
 * Each goes when the reader supplies what it lost, and does not come back: a
 * ring drawn takes the ring's line, a list pasted the list's, and a model
 * picked the model's, which `useForecastSelection` already tracks. Held as
 * state for the ring and the list because clearing the drawn ring later is
 * the reader's own edit, not the link's loss returning. A dismissal is the
 * ledger's (`usePanelMessages`), like every derived line's.
 */
export function useLinkDrops({ dropped, ring, list, modelLost }: LinkDropInputs): readonly LinkDrop[] {
  const [lost, setLost] = useState(() => dropped.filter((what) => what !== 'model'))
  useEffect(() => {
    setLost((prev) => {
      const next = prev.filter((what) => !(what === 'ring' && ring) && !(what === 'list' && list))
      return next.length === prev.length ? prev : next
    })
  }, [ring, list])
  return useMemo(() => (modelLost ? [...lost, 'model' as const] : lost), [lost, modelLost])
}
