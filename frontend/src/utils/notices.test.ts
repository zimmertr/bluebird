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
