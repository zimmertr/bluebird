import { describe, expect, it } from 'vitest'
import { eventNoticeKey, eventNoticeVisible, rearmDismissal } from './notices'

describe('eventNoticeKey', () => {
  it('is null when neither notice exists', () => {
    expect(eventNoticeKey(null, null)).toBeNull()
  })

  it('identifies an error by its message', () => {
    expect(eventNoticeKey('Open-Meteo quota reached. Try again later.', null)).toBe(
      'error:Open-Meteo quota reached. Try again later.',
    )
  })

  it('lets the refusal win, matching the render precedence', () => {
    expect(eventNoticeKey('some error', 'over the limit')).toBe('refusal:over the limit')
  })

  it('never confuses an error with a refusal carrying the same text', () => {
    expect(eventNoticeKey('same text', null)).not.toBe(eventNoticeKey(null, 'same text'))
  })
})

describe('rearmDismissal', () => {
  it('holds a dismissal while its notice persists', () => {
    expect(rearmDismissal('error:a', 'error:a')).toBe('error:a')
  })

  it('spends every dismissal when the slate clears', () => {
    // Analyze clears both notice states before it fetches, so this is the
    // next-Analyze re-arm: key → null → key.
    expect(rearmDismissal('error:a', null)).toBeNull()
  })
})

describe('eventNoticeVisible', () => {
  it('shows a notice nobody dismissed', () => {
    expect(eventNoticeVisible('error:a', null)).toBe(true)
  })

  it('hides the dismissed notice', () => {
    expect(eventNoticeVisible('error:a', 'error:a')).toBe(false)
  })

  it('shows fresh content through a stale dismissal', () => {
    expect(eventNoticeVisible('error:b', 'error:a')).toBe(true)
  })

  it('renders nothing when there is no notice', () => {
    expect(eventNoticeVisible(null, null)).toBe(false)
    expect(eventNoticeVisible(null, 'error:a')).toBe(false)
  })
})

describe('the dismissal lifecycle', () => {
  // The full loop the criteria name: dismiss, re-analyze, and the identical
  // failure must show again because the analyze-start clear spent the
  // dismissal on its way through.
  it('shows an identical message again after the next Analyze', () => {
    const first = eventNoticeKey('Open-Meteo quota reached. Try again later.', null)
    let dismissed: string | null = first // the click
    expect(eventNoticeVisible(first, dismissed)).toBe(false)

    dismissed = rearmDismissal(dismissed, null) // analyze start clears both states
    const second = eventNoticeKey('Open-Meteo quota reached. Try again later.', null)
    expect(eventNoticeVisible(second, dismissed)).toBe(true)
  })

  it('keeps a dismissal through re-renders that change nothing', () => {
    const key = eventNoticeKey(null, 'over the limit')
    let dismissed: string | null = key
    dismissed = rearmDismissal(dismissed, key)
    dismissed = rearmDismissal(dismissed, key)
    expect(eventNoticeVisible(key, dismissed)).toBe(false)
  })
})
