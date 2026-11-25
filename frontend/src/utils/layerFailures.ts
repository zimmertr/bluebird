import { CLOSURE_DATA_UNAVAILABLE } from './closures'
import { FIRE_ACTIVITY_DATA_UNAVAILABLE } from './fireActivity'
import { LANDMARKS_UNAVAILABLE } from './landmarks'
import { SMOKE_DATA_UNAVAILABLE } from './smoke'
import { WILDFIRE_DATA_UNAVAILABLE } from './wildfires'

/**
 * Which of the pod's map layers are on and failing, and what the Analyze
 * button's messages say about them (record 0344).
 *
 * Each layer's fetch already threw its own approved sentence and logged it,
 * and the layer drew nothing, so "no fires here" and "the fire feed is down"
 * looked the same. A layer reports a failure while it is on and its last
 * fetch failed, and clears it when one lands or it is switched off
 * (`map/overlays/recovery.ts`). The two closure layers are one line: they
 * share a sentence and a feed.
 */
export type FailingLayer = 'wildfires' | 'area-closures' | 'trail-closures' | 'fire-activity' | 'smoke' | 'landmarks'

/** No layer failing: one frozen set, so a quiet map hands every reader the same value. */
export const NO_FAILING_LAYERS: ReadonlySet<FailingLayer> = new Set()

/** The set with `layer` marked failing or not; `prev` itself when nothing changes. */
export function withLayerFailure(
  prev: ReadonlySet<FailingLayer>,
  layer: FailingLayer,
  failing: boolean,
): ReadonlySet<FailingLayer> {
  if (prev.has(layer) === failing) return prev
  const next = new Set(prev)
  if (failing) next.add(layer)
  else next.delete(layer)
  return next.size ? next : NO_FAILING_LAYERS
}

/**
 * One line per failing feed, in the Layers menu's order, each keyed on its
 * condition. Every key here opens the list (`LIST_OPENING_KEYS`).
 */
export const LAYER_FAILURES: readonly { key: string; layers: readonly FailingLayer[]; text: string }[] = [
  { key: 'layer:wildfires', layers: ['wildfires'], text: WILDFIRE_DATA_UNAVAILABLE },
  { key: 'layer:fire-activity', layers: ['fire-activity'], text: FIRE_ACTIVITY_DATA_UNAVAILABLE },
  { key: 'layer:smoke', layers: ['smoke'], text: SMOKE_DATA_UNAVAILABLE },
  { key: 'layer:closures', layers: ['area-closures', 'trail-closures'], text: CLOSURE_DATA_UNAVAILABLE },
  { key: 'layer:landmarks', layers: ['landmarks'], text: LANDMARKS_UNAVAILABLE },
]
