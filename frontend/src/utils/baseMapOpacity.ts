// The four base-map layers' opacity levels (#799, record 0241): what a level
// is, its default, and the one rule every surface reads it by. Apart from the
// hook that holds them and the link that carries them, because both of those
// and the map's own modules need the same four names and the same default,
// and none of them owns the others.
import { clamp } from './numbers'

/** The four Base map rows that carry an opacity slider, by their link flag. */
export type BaseLayer = 'satellite' | 'topo' | 'relief' | 'slope'

/** The four in the menu's order. */
export const BASE_LAYERS: readonly BaseLayer[] = ['satellite', 'topo', 'relief', 'slope']

/** Each layer's level, a whole percent from 0 to 100. */
export type BaseOpacity = Readonly<Record<BaseLayer, number>>

/**
 * Where every slider starts, the maintainer's (2026-10-29): half, which is the
 * strength each layer drew at before it had a slider, so a reader who never
 * touches one sees the map they saw before.
 */
export const OPACITY_DEFAULT = 50

export const DEFAULT_BASE_OPACITY: BaseOpacity = {
  satellite: OPACITY_DEFAULT,
  topo: OPACITY_DEFAULT,
  relief: OPACITY_DEFAULT,
  slope: OPACITY_DEFAULT,
}

/** A level as the slider and the link hold it: a whole percent, 0 to 100. */
export function clampOpacity(level: number): number {
  return clamp(Math.round(level), 0, 100)
}

/**
 * A level as the map draws it, 0 to 1. The satellite and the slope draw at
 * exactly this; the contours and the relief read it as a multiple of their
 * own look at the default (`overDefault`).
 */
export function opacityOf(level: number): number {
  return clampOpacity(level) / 100
}

/**
 * How many times its own default look a layer draws at, 0 to 2: 1 at the
 * default level, 2 at 100. For the two layers whose look at the default was
 * tuned by eye before the slider existed, the contours and the relief, so the
 * default keeps that look and 100 doubles it.
 */
export function overDefault(opacity: number): number {
  return opacity / (OPACITY_DEFAULT / 100)
}
