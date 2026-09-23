/**
 * The IEM radar loop: twelve raster frames created when the overlay is switched
 * on and torn down when it is switched off, the background warm-up that fetches
 * their tiles one frame at a time, and which frame is on screen.
 *
 * Created on toggle rather than declared at load: a raster source starts
 * fetching the moment a rendered layer names it, so leaving the frames in place
 * would download radar tiles for everyone who never asked for any.
 *
 * Inserted before the first smoke fill, which puts the whole loop under every
 * polygon overlay and under the draw, result and label layers above them.
 */
import type * as maplibregl from 'maplibre-gl'
import { radarLayerId, radarOffsets, radarTileUrl } from '../../utils/radar'
import { SMOKE_DENSITIES, smokeLayerId } from '../../utils/smoke'

/**
 * How solid the radar frame on screen is drawn.
 *
 * Light enough that basemap labels survive underneath it, which is the point of
 * a radar overlay on a map you are also reading place names off. Named because
 * two places need the same number (the layer's opening paint and the opacity
 * flip that advances a frame) and a frame that faded up to a different value
 * than it appeared at would pulse every time the loop wrapped.
 */
export const RADAR_OPACITY = 0.65

/**
 * How far apart the loop's frames are armed after the layer is switched on.
 *
 * One frame is ~35 tiles at the zooms this overlay is read at, so twelve of
 * them is ~420 requests. Spacing them keeps that off IEM as a burst and keeps
 * the whole set inside about six seconds, which is comfortably less time than
 * it takes to notice the timeline and reach for play.
 *
 * Deliberately unrelated to the playback frame rate: this paces a download,
 * that paces an animation, and tying them would mean a slower loop also loaded
 * more slowly.
 */
export const RADAR_WARM_MS = 500

/** The frame a playhead index lands on, clamped to the loop's ends. */
export function activeOffset(offsets: readonly number[], index: number): number {
  return offsets[Math.max(0, Math.min(offsets.length - 1, index))]
}

export interface RadarOverlay {
  update(next: { show: boolean; index: number }): void
  dispose(): void
}

export function mountRadar(map: maplibregl.Map): RadarOverlay {
  let showing = false
  let warmTimer: ReturnType<typeof setInterval> | undefined

  function addFrames() {
    const beneath = smokeLayerId(SMOKE_DENSITIES[0])
    for (const offset of radarOffsets()) {
      const id = radarLayerId(offset)
      if (map.getSource(id)) continue
      map.addSource(id, {
        type: 'raster',
        tiles: [radarTileUrl(offset)],
        tileSize: 256,
        // No `attribution` here on purpose. IEM's credit is on the radar
        // legend, beside the data, which is where this app puts a provider's
        // name (the NIFC and NOAA credits are the same shape). Adding it to
        // MapLibre's attribution control as well would say it twice, and the
        // second copy is the expensive one: it pushed that control onto a
        // second line on a phone, straight under the timeline.
      })
      map.addLayer(
        {
          id,
          type: 'raster',
          source: id,
          layout: {
            // Every frame but the one on screen starts unrendered, and an
            // unrendered raster layer fetches no tiles, so toggling the loop on
            // costs one frame's tiles rather than twelve. The other eleven are
            // armed a moment later by the warm-up below, which is what makes
            // playback smooth rather than a slideshow of half-loaded frames.
            visibility: 'none',
          },
          paint: {
            'raster-opacity': RADAR_OPACITY,
            // A frame change is an opacity flip between two layers, so the
            // library's own cross-fade would fight it and leave both frames
            // half-drawn for a moment, at 500 ms a frame.
            'raster-fade-duration': 0,
          },
        },
        map.getLayer(beneath) ? beneath : undefined,
      )
    }
  }

  function removeFrames() {
    for (const offset of radarOffsets()) {
      const id = radarLayerId(offset)
      if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
    }
  }

  // Warm the loop's frames in the background, one every RADAR_WARM_MS.
  //
  // Arming on demand (a frame the first time the playhead reached it) is what
  // made the loop strobe: an unrendered raster layer holds no tiles, so each
  // frame's first turn on screen was a blank 500 ms while a fetch went out, and
  // the whole first pass flashed.
  //
  // Two things rule out simply showing all twelve at once. It is 420 tile
  // requests in a burst against a donated server that asks large applications
  // to self-host, which is not the way to hold up our end. And it does not
  // work: MapLibre schedules tile loading off style and transform changes, so
  // one batch of twelve on a map nobody is touching dispatched six frames'
  // worth of requests and then sat there. Measured at 7 of 12 frames after
  // thirty seconds with every missing tile answering 200 to a direct fetch.
  //
  // Arming one at a time solves both: each layer's own style change is what
  // gets its tiles fetched, and the requests arrive spread out. A frame the
  // playhead reaches before the warm-up does is shown by `showFrame`
  // regardless, so nothing waits on this.
  //
  // The loop runs until every source reports loaded rather than until the last
  // frame is armed, and repaints on each tick, because being armed is not the
  // same as being fetched: MapLibre services its tile queue during a render, so
  // a map nobody is touching goes idle with the tail of the queue still
  // outstanding. That is the measured failure: six frames loaded and six
  // armed-but-empty, unchanged after thirty seconds, with every missing tile
  // answering 200 to a direct fetch.
  function startWarmUp() {
    const queue = radarOffsets().slice()
    warmTimer = setInterval(() => {
      const offset = queue.shift()
      if (offset !== undefined) {
        const id = radarLayerId(offset)
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
      }
      const armed = radarOffsets().filter((o) => map.getLayer(radarLayerId(o)))
      if (queue.length === 0 && armed.every((o) => map.isSourceLoaded(radarLayerId(o)))) {
        clearInterval(warmTimer)
        warmTimer = undefined
        return
      }
      map.triggerRepaint()
    }, RADAR_WARM_MS)
  }

  function stopWarmUp() {
    clearInterval(warmTimer)
    warmTimer = undefined
  }

  // Which radar frame is on screen. Every armed frame is rendered at all times
  // and only its opacity moves, so advancing is a flip between two layers that
  // both already hold their tiles: no fetch, no fade, no gap.
  function showFrame(index: number) {
    const offsets = radarOffsets()
    const active = activeOffset(offsets, index)
    for (const offset of offsets) {
      const id = radarLayerId(offset)
      if (!map.getLayer(id)) continue
      // A frame the warm-up has not reached yet still has to be shown when the
      // playhead lands on it, or scrubbing in the first second after a toggle
      // would land on nothing.
      if (offset === active) map.setLayoutProperty(id, 'visibility', 'visible')
      map.setPaintProperty(id, 'raster-opacity', offset === active ? RADAR_OPACITY : 0)
    }
  }

  return {
    update({ show, index }) {
      if (show && !showing) {
        addFrames()
        startWarmUp()
      } else if (!show && showing) {
        stopWarmUp()
        removeFrames()
      }
      showing = show
      if (show) showFrame(index)
    },
    dispose() {
      stopWarmUp()
    },
  }
}
