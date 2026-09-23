// Every per-file check, gathered so eslint.config.js and selftest.js read one
// list. Grouped by the part of the app a check is about.
import { ACCESSIBILITY } from './accessibility.js'
import { APP } from './app.js'
import { DATA } from './data.js'
import { STYLES } from './styles.js'

export const CHECKS = [...ACCESSIBILITY, ...APP, ...DATA, ...STYLES]
