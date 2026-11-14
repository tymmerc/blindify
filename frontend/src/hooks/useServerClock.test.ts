import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useServerClock } from "./useServerClock"

afterEach(() => vi.useRealTimers())

describe("useServerClock", () => {
  it("avance tout seul, puis reste fige pendant une pause", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { result, rerender } = renderHook(({ paused }) => useServerClock(1_005_000, true, paused), { initialProps: { paused: false } })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(1_006_000)
    rerender({ paused: true })
    const frozen = result.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current).toBe(frozen)
    rerender({ paused: false })
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe(1_009_250)
  })
})
