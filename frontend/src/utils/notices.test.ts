import { describe, expect, it } from 'vitest'
import {
  BLOCKER_SEVERITY,
  FooterMessage,
  SEVERITY_ORDER,
  blockerKey,
  blockerOf,
  eventKindOf,
  listPhrase,
  isDismissed,
  noticeBoxes,
  noticeKey,
  pruneDismissals,
  worstSeverity,
} from './notices'

describe('noticeKey', () => {
  it('identifies a notice by kind and message', () => {
    expect(noticeKey('error', 'Cannot reach Open-Meteo. Try again later.')).toBe(
      'error:Cannot reach Open-Meteo. Try again later.',
    )
  })

  it('never confuses an error with a refusal carrying the same text', () => {
    expect(noticeKey('error', 'same text')).not.toBe(noticeKey('refusal', 'same text'))
  })
})

describe('isDismissed', () => {
  it('hides the dismissed notice and only it', () => {
    const dismissed = [noticeKey('refusal', 'over the limit')]
    expect(isDismissed(noticeKey('refusal', 'over the limit'), dismissed)).toBe(true)
    expect(isDismissed(noticeKey('error', 'network down'), dismissed)).toBe(false)
  })

  it('shows fresh content through a stale dismissal', () => {
    const dismissed = [noticeKey('error', 'message a')]
    expect(isDismissed(noticeKey('error', 'message b'), dismissed)).toBe(false)
  })
})

describe('pruneDismissals', () => {
  it('keeps a dismissal while its notice persists', () => {
    const key = noticeKey('error', 'a')
    expect(pruneDismissals([key], [key, null])).toEqual([key])
  })

  it('spends every dismissal when no notice is active', () => {
    // Analyze clears both notice states before it fetches, so this is the
    // next-Analyze re-arm: key → no keys → key.
    expect(pruneDismissals([noticeKey('error', 'a')], [null, null])).toEqual([])
  })

  it('prunes only the dismissal whose notice went away', () => {
    const errorKey = noticeKey('error', 'a')
    const refusalKey = noticeKey('refusal', 'b')
    expect(pruneDismissals([errorKey, refusalKey], [refusalKey, null])).toEqual([refusalKey])
  })

  it('returns the same reference when nothing was pruned', () => {
    const dismissed = [noticeKey('error', 'a')]
    expect(pruneDismissals(dismissed, [noticeKey('error', 'a')])).toBe(dismissed)
  })
})

describe('the dismissal lifecycle', () => {
  // The full loop the acceptance criteria name: dismiss, re-analyze, and the
  // identical failure must show again because the analyze-start clear spent
  // the dismissal on its way through.
  it('shows an identical message again after the next Analyze', () => {
    const key = noticeKey('error', 'Open-Meteo quota reached. Try again later.')
    let dismissed: readonly string[] = [key] // the click
    expect(isDismissed(key, dismissed)).toBe(true)

    dismissed = pruneDismissals(dismissed, [null, null]) // analyze start clears both states
    expect(isDismissed(key, dismissed)).toBe(false)
  })

  it('dismisses each notice individually when more than one is dismissable', () => {
    const errorKey = noticeKey('error', 'network down')
    const refusalKey = noticeKey('refusal', 'over the limit')
    let dismissed: readonly string[] = []

    dismissed = [...dismissed, refusalKey] // dismiss one box
    expect(isDismissed(refusalKey, dismissed)).toBe(true)
    expect(isDismissed(errorKey, dismissed)).toBe(false) // the other stays

    dismissed = pruneDismissals(dismissed, [errorKey, refusalKey]) // both still active
    expect(isDismissed(refusalKey, dismissed)).toBe(true)
  })
})

describe('derived warnings keyed by condition', () => {
  it('dismissing every shown message leaves a later, different condition visible', () => {
    // Each message dismisses under its own key; a new blocker later is not
    // among them and reopens its box alone.
    let dismissed: readonly string[] = ['blocker:destinations', 'cue:window-changed']
    dismissed = pruneDismissals(dismissed, [
      'blocker:destinations',
      'cue:window-changed',
      'blocker:area',
    ])
    expect(isDismissed('blocker:area', dismissed)).toBe(false)
    expect(isDismissed('blocker:destinations', dismissed)).toBe(true)
    expect(isDismissed('cue:window-changed', dismissed)).toBe(true)
  })
})

describe('blocker severities', () => {
  // Every blocker is an error (record 0210, the maintainer, 2026-10-21): it
  // holds the Analyze button up, and the badge on the button wears the worst
  // severity current, so a greyed button never sits under a blue badge.
  it('pins every blocker to the error box', () => {
    expect(BLOCKER_SEVERITY).toEqual({
      area: 'error',
      window: 'error',
      dates: 'error',
      'compare-aqi': 'error',
      'compare-freeze': 'error',
      destinations: 'error',
      polygon: 'error',
      types: 'error',
    })
  })
})

describe('noticeBoxes', () => {
  const msg = (key: string, severity: FooterMessage['severity']): FooterMessage => ({
    key,
    text: key,
    severity,
  })

  it('renders one box per severity, in error, warning, info order', () => {
    // Caller order is info-first here; the boxes must not follow it.
    const boxes = noticeBoxes([
      msg('blocker:dates', 'info'),
      msg('cue:window-changed', 'warn'),
      msg('fire:unavailable', 'error'),
    ])
    expect(boxes.map((b) => b.severity)).toEqual(['error', 'warn', 'info'])
  })

  it('drops a box with nothing to say', () => {
    const boxes = noticeBoxes([msg('blocker:dates', 'info')])
    expect(boxes.map((b) => b.severity)).toEqual(['info'])
  })

  it('returns no boxes for no messages', () => {
    expect(noticeBoxes([])).toEqual([])
  })

  it('keeps the caller order inside one box', () => {
    // The caller lists messages by what the reader can act on; grouping must
    // not re-sort them.
    const boxes = noticeBoxes([
      msg('error:run', 'error'),
      msg('blocker:area', 'error'),
      msg('fire:unavailable', 'error'),
    ])
    expect(boxes).toHaveLength(1)
    expect(boxes[0].messages.map((m) => m.key)).toEqual([
      'error:run',
      'blocker:area',
      'fire:unavailable',
    ])
  })

  // Which dismissals clear an event and which join the ledger (#736).
  it('tells an event notice from a derived line by its key', () => {
    expect(eventKindOf(noticeKey('error', 'Open-Meteo request failed. Try again later.'))).toBe('error')
    expect(eventKindOf(noticeKey('refusal', 'Too many.'))).toBe('refusal')
    expect(eventKindOf('blocker:area')).toBeNull()
    expect(eventKindOf('cue:window-changed')).toBeNull()
    expect(eventKindOf('fire:unavailable')).toBeNull()
  })
})

// The badge's colour (record 0208): the worst severity among the messages,
// in the order the boxes stand in.
describe('worstSeverity', () => {
  const msg = (key: string, severity: FooterMessage['severity']): FooterMessage => ({ key, text: key, severity })

  it('runs error, warn, info, the order the boxes stand in', () => {
    expect(SEVERITY_ORDER).toEqual(['error', 'warn', 'info'])
  })

  it('names the worst severity present, or none', () => {
    expect(worstSeverity([])).toBeNull()
    expect(worstSeverity([msg('a', 'info')])).toBe('info')
    expect(worstSeverity([msg('a', 'info'), msg('b', 'warn')])).toBe('warn')
    expect(worstSeverity([msg('a', 'warn'), msg('b', 'error'), msg('c', 'info')])).toBe('error')
  })
})

// A blocker's key, and the blocker read back off a key: what tells a line
// that stands under a field from one that lives in the list alone.
describe('blocker keys', () => {
  it('spells a blocker key and reads it back', () => {
    expect(blockerKey('area')).toBe('blocker:area')
    expect(blockerOf('blocker:area')).toBe('area')
    expect(blockerOf(blockerKey('compare-aqi'))).toBe('compare-aqi')
  })

  it('reads no blocker off any other key', () => {
    expect(blockerOf('cue:window-changed')).toBeNull()
    expect(blockerOf('ring:types')).toBeNull()
    expect(blockerOf('blocker:')).toBeNull()
    expect(blockerOf('blocker:nothing')).toBeNull()
  })
})

describe('listPhrase', () => {
  it('says one name plainly', () => {
    expect(listPhrase(['ECMWF IFS'])).toBe('ECMWF IFS')
  })

  it('joins two with "and" and no comma', () => {
    expect(listPhrase(['ECMWF IFS', 'JMA GSM'])).toBe('ECMWF IFS and JMA GSM')
  })

  it('commas three or more, with "and" before the last', () => {
    expect(listPhrase(['ECMWF IFS', 'JMA GSM', 'ECCC GEM'])).toBe(
      'ECMWF IFS, JMA GSM and ECCC GEM',
    )
  })

  // The caller only ever passes a non-empty list, but a joiner that returns
  // "undefined" into a sentence is the kind of defect a reader sees and a
  // type does not.
  it('yields nothing for an empty list', () => {
    expect(listPhrase([])).toBe('')
  })
})
