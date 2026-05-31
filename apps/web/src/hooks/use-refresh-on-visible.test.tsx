import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useRefreshOnVisible } from './use-refresh-on-visible'

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function fireVisibilityChange() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useRefreshOnVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-11T00:00:00Z'))
    setVisibilityState('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires the callback when the document becomes visible', () => {
    const callback = vi.fn()
    renderHook(() => useRefreshOnVisible(callback))

    // No mount-time invocation.
    expect(callback).toHaveBeenCalledTimes(0)

    // Simulate hidden → visible transition.
    setVisibilityState('hidden')
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(0)

    setVisibilityState('visible')
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid visibility events within minIntervalMs', () => {
    const callback = vi.fn()
    renderHook(() => useRefreshOnVisible(callback, { minIntervalMs: 1000 }))

    setVisibilityState('visible')
    fireVisibilityChange()
    fireVisibilityChange()
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(1)

    // Advance past the debounce window.
    vi.setSystemTime(new Date('2026-04-11T00:00:02Z'))
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('does not attach the listener when enabled is false', () => {
    const callback = vi.fn()
    renderHook(() => useRefreshOnVisible(callback, { enabled: false }))

    setVisibilityState('visible')
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(0)
  })

  it('ignores visibility changes where state is not visible', () => {
    const callback = vi.fn()
    renderHook(() => useRefreshOnVisible(callback))

    setVisibilityState('hidden')
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(0)
  })

  it('uses the latest callback without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useRefreshOnVisible(fn),
      { initialProps: { fn: first } },
    )

    rerender({ fn: second })

    setVisibilityState('visible')
    fireVisibilityChange()
    expect(first).toHaveBeenCalledTimes(0)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
