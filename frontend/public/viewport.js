// The page runs under the screen's foot on an iPhone alone (#837; record
// 0262). iOS needs viewport-fit=cover for its home indicator (record 0152).
// Android stops the page above its own bar, and with cover Firefox reports a
// band it never draws the page under, which padded the results sheet's foot.
if (/Android/i.test(navigator.userAgent)) {
  var m = document.querySelector('meta[name="viewport"]')
  if (m) m.setAttribute('content', m.getAttribute('content').replace(/,\s*viewport-fit=cover/, ''))
}
