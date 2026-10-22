import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { THEME_SWITCHING_CLASS, useTheme } from './useTheme'
import { THEME_KEY } from '../utils/viewPrefs'

describe('useTheme (#706)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('starts dark with nothing stored, and leaves the root without the attribute', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    // A mount reads; it never writes back what it read.
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('starts light when this browser chose it, and marks the root', () => {
    localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('switches both ways, keeping the choice and the attribute in step', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  // A switch lands in one frame (#786): transitions are held off while the
  // new tokens resolve and let go on the next frame, and a mount, which only
  // agrees with what `theme.js` wrote, holds nothing.
  it('holds transitions off for the frame a switch lands in, and not on mount', () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const root = document.documentElement
    const { result } = renderHook(() => useTheme())
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    expect(frames).toHaveLength(0)
    act(() => result.current.toggleTheme())
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(true)
    expect(frames).toHaveLength(1)
    frames[0](0)
    expect(root.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    raf.mockRestore()
  })

  it('lets go of a held switch when the next one starts', () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    act(() => result.current.toggleTheme())
    expect(cancel).toHaveBeenCalledOnce()
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(false)
    raf.mockRestore()
    cancel.mockRestore()
  })

  it('hands out one toggle for the life of the mount', () => {
    const { result } = renderHook(() => useTheme())
    const first = result.current.toggleTheme
    act(() => first())
    expect(result.current.toggleTheme).toBe(first)
  })
})
