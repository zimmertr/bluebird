// The stored theme, or the device's when none is (#706, #843), on the root
// before the first paint. Classic and same-origin: the CSP allows no inline.
try {
  var t = localStorage.getItem('bluebird_forecast_theme')
  if (t === 'light' || (t !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches)) {
    document.documentElement.dataset.theme = 'light'
  }
} catch (e) {}
