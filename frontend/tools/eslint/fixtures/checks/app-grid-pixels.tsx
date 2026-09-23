// Must trip: an encoded image, and an image source updated by url.
const BLANK = 'data:image/png;base64,iVBORw0KGgo='
export function clear(map: any) {
  map.getSource('forecast-grid').updateImage({ url: BLANK })
}
