// The stored theme, on the root before the first paint (#706). Classic and
// same-origin, because the CSP allows 'self' and no inline script.
try {
  if (localStorage.getItem('bluebird_forecast_theme') === 'light') {
    document.documentElement.dataset.theme = 'light'
  }
} catch (e) {}
