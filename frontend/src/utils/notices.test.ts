import { describe, expect, it } from 'vitest'
import { isDismissed, noticeKey, pruneDismissals } from './notices'

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

  it('keeps a dismissal through re-renders that change nothing', () => {
    const key = noticeKey('refusal', 'over the limit')
    let dismissed: readonly string[] = [key]
    dismissed = pruneDismissals(dismissed, [key])
    dismissed = pruneDismissals(dismissed, [key])
    expect(isDismissed(key, dismissed)).toBe(true)
  })
})

describe('derived warnings keyed by condition', () => {
  // The blocker text counts down as the user draws ("2 more points" → "1
  // more point"), but its key stays `blocker:polygon`, so the dismissal
  // holds through the countdown instead of resurfacing per click.
  it('holds through text changes inside one condition', () => {
    let dismissed: readonly string[] = ['blocker:polygon']
    dismissed = pruneDismissals(dismissed, ['blocker:polygon']) // text changed, key did not
    expect(isDismissed('blocker:polygon', dismissed)).toBe(true)
  })

  it('returns when the condition clears and later triggers again', () => {
    let dismissed: readonly string[] = ['blocker:destinations']
    dismissed = pruneDismissals(dismissed, []) // a destination was provided
    expect(isDismissed('blocker:destinations', dismissed)).toBe(false) // then removed again
  })

  it('dismissing the warnings box leaves a later, different condition visible', () => {
    // The box X records the keys it currently shows; a new blocker later is
    // not among them and reopens the box alone.
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
