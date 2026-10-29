/**
 * « 👀 1 spectateur » (T18) : les joueurs voient discretement que l'editeur
 * regarde la partie. Rien quand personne ne regarde.
 */
import { act, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SpectatorBadge } from "./SpectatorBadge"
import { useSpectatorCount, SPECTATORS_EVENT } from "@/app/multiplayer/hooks/useSpectatorCount"

describe("SpectatorBadge", () => {
  it("rien a 0", () => {
    const { container } = render(<SpectatorBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("1 spectateur, puis 2 spectateurs", () => {
    const { rerender } = render(<SpectatorBadge count={1} />)
    expect(screen.getByText("1 spectateur")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveAccessibleName(/1 spectateur regarde la partie/i)
    rerender(<SpectatorBadge count={2} />)
    expect(screen.getByText("2 spectateurs")).toBeInTheDocument()
  })
})

function fakeSocket() {
  const handlers = new Map<string, Set<(p: unknown) => void>>()
  return {
    on: vi.fn((event: string, fn: (p: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    }),
    off: vi.fn((event: string, fn: (p: unknown) => void) => handlers.get(event)?.delete(fn)),
    emit: vi.fn(),
    fire(event: string, payload: unknown) {
      handlers.get(event)?.forEach(fn => fn(payload))
    },
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
  }
}

describe("useSpectatorCount", () => {
  it("demande le compte en arrivant, suit les mises a jour de SA salle", () => {
    const socket = fakeSocket()
    const { result, unmount } = renderHook(() => useSpectatorCount(socket as never, "ABCD12"))
    expect(socket.emit).toHaveBeenCalledWith("room:spectators:get", { roomCode: "ABCD12" })
    expect(result.current).toBe(0)
    act(() => socket.fire(SPECTATORS_EVENT, { roomCode: "ABCD12", count: 1 }))
    expect(result.current).toBe(1)
    act(() => socket.fire(SPECTATORS_EVENT, { roomCode: "AUTRE1", count: 5 }))
    expect(result.current).toBe(1)
    act(() => socket.fire(SPECTATORS_EVENT, { roomCode: "ABCD12", count: 0 }))
    expect(result.current).toBe(0)
    unmount()
    expect(socket.listeners(SPECTATORS_EVENT)).toBe(0)
  })

  it("sans socket ni salle : 0, rien d'emis", () => {
    const { result } = renderHook(() => useSpectatorCount(null, null))
    expect(result.current).toBe(0)
  })

  it("compte invalide ignore", () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useSpectatorCount(socket as never, "ABCD12"))
    act(() => socket.fire(SPECTATORS_EVENT, { roomCode: "ABCD12", count: "beaucoup" }))
    act(() => socket.fire(SPECTATORS_EVENT, { roomCode: "ABCD12", count: -3 }))
    expect(result.current).toBe(0)
  })
})
