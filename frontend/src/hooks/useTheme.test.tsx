import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTheme } from './useTheme'
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

  it('hands out one toggle for the life of the mount', () => {
    const { result } = renderHook(() => useTheme())
    const first = result.current.toggleTheme
    act(() => first())
    expect(result.current.toggleTheme).toBe(first)
  })
})
