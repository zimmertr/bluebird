import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { LIGHT_QUERY, THEME_SWITCHING_CLASS, useTheme } from './useTheme'
import { mediaList } from '../testSupport/mediaList'
import { THEME_KEY } from '../utils/viewPrefs'

describe('useTheme (#706, #843)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    vi.unstubAllGlobals()
  })

  it('follows a dark device with nothing stored, and leaves the root without the attribute', () => {
    const media = mediaList(false)
    const { result } = renderHook(() => useTheme())
    expect(media.list.media).toBe(LIGHT_QUERY)
    expect(result.current.choice).toBe('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    // A mount reads; it never writes back what it read.
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('follows a light device with nothing stored', () => {
    mediaList(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.choice).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  // The sunset case: the open app repaints when the device changes, with no
  // reload, and stops listening when it unmounts.
  it('repaints when the device changes while System is chosen', () => {
    const media = mediaList(false)
    const { unmount } = renderHook(() => useTheme())
    media.flip(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    media.flip(false)
    expect(document.documentElement.dataset.theme).toBeUndefined()
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('holds a chosen theme whatever the device says, and stores it by name', () => {
    const media = mediaList(true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark'))
    expect(result.current.choice).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    // A chosen theme does not listen at all.
    expect(media.listeners.size).toBe(0)
    media.flip(false)
    media.flip(true)
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('starts on the stored choice over the device', () => {
    mediaList(false)
    localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.choice).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  // Back to System reads the device afresh, since it may have changed while a
  // chosen theme was not listening, and forgets the stored choice.
  it('follows the device again on the way back to System', () => {
    const media = mediaList(false)
    localStorage.setItem(THEME_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    media.list.matches = true
    act(() => result.current.setChoice('system'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(media.listeners.size).toBe(1)
  })

  // A switch lands in one frame (#786): transitions are held off while the
  // new tokens resolve and let go on the next frame, and a mount, which only
  // agrees with what `theme.js` wrote, holds nothing. A device change takes
  // the same path as a pick.
  it('holds transitions off for the frame a switch lands in, and not on mount', () => {
    const media = mediaList(false)
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const root = document.documentElement
    const { result } = renderHook(() => useTheme())
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    expect(frames).toHaveLength(0)
    act(() => result.current.setChoice('light'))
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(true)
    expect(frames).toHaveLength(1)
    frames[0](0)
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    act(() => result.current.setChoice('system'))
    expect(frames).toHaveLength(2)
    frames[1](0)
    media.flip(true)
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(true)
    expect(frames).toHaveLength(3)
    raf.mockRestore()
  })

  // A pick that lands on the theme already painted is no switch: System on a
  // light device after Light changes the choice and nothing on screen.
  it('holds nothing when a pick paints the theme already on screen', () => {
    mediaList(true)
    localStorage.setItem(THEME_KEY, 'light')
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('system'))
    expect(frames).toHaveLength(0)
    expect(document.documentElement.dataset.theme).toBe('light')
    raf.mockRestore()
  })

  it('lets go of a held switch when the next one starts', () => {
    mediaList(false)
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useTheme())
    act(() => result.current.setChoice('light'))
    act(() => result.current.setChoice('dark'))
    expect(cancel).toHaveBeenCalledOnce()
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    raf.mockRestore()
    cancel.mockRestore()
  })

  it('hands out one setter for the life of the mount', () => {
    mediaList(false)
    const { result } = renderHook(() => useTheme())
    const first = result.current.setChoice
    act(() => first('light'))
    expect(result.current.setChoice).toBe(first)
  })
})
