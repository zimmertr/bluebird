import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setWelcomed } from '../utils/viewPrefs'

// Setup for the `dom` project alone: the node project never loads this file.

// Testing Library unmounts after each test by itself only when the runner
// exposes globals, and this config does not. Without it every render stays in
// the document and the next test's queries find two of everything.
afterEach(() => cleanup())

// Storage outlives a test in jsdom, so a preference one test writes would be a
// restored view in the next. The welcome flag is set because the modal opens
// over everything on a first visit, and a test that renders the app is asking
// about the app rather than about the welcome.
beforeEach(() => {
  localStorage.clear()
  setWelcomed()
})

// Two browser methods jsdom does not implement and the components call as a
// side effect of doing something else: the model list scrolls its highlighted
// row into view, and a column grip captures the pointer it was pressed with.
// A no-op is the truth here, since jsdom lays nothing out to scroll or capture.
Element.prototype.scrollIntoView ??= function () {}
Element.prototype.setPointerCapture ??= function () {}
Element.prototype.releasePointerCapture ??= function () {}
