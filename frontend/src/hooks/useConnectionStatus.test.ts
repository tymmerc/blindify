import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { BACK_FOR_MS, LOST_AFTER_MS, SHOW_AFTER_MS, useConnectionStatus, watchConnection } from "./useConnectionStatus"

/** Faux socket : connected, active, et les trois evenements que la surveillance ecoute. */
type Listener = (...args: never[]) => void

function fakeSocket(connected = true) {
  const listeners = new Map<string, Set<Listener>>()
  const s = {
    connected,
    active: connected,
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(fn)
    },
    off(event: string, fn: Listener) {
      listeners.get(event)?.delete(fn)
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(fn => (fn as (...a: unknown[]) => void)(...args))
    },
    count: (event: string) => listeners.get(event)?.size ?? 0,
    /** Coupure que socket.io va reparer (serveur redemarre, reseau). */
    drop(reason = "transport close") {
      s.connected = false
      s.active = true
      s.emit("disconnect", reason)
    },
    /** Coupure voulue : disconnectSocket(), ou fermeture par le serveur. */
    close(reason = "io client disconnect") {
      s.connected = false
      s.active = false
      s.emit("disconnect", reason)
    },
    reconnect() {
      s.connected = true
      s.active = true
      s.emit("connect")
    },
  }
  return s
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("watchConnection", () => {
  function watch(socket = fakeSocket()) {
    const seen: string[] = []
    const stop = watchConnection(socket, st => seen.push(st))
    return { socket, seen, stop }
  }

  it("n'affiche rien pour une coupure de moins d'une seconde", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS - 1)
    socket.reconnect()
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual([])
  })

  it("affiche la reconnexion apres une seconde, puis « Reconnecté » au retour, puis plus rien", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    expect(seen).toEqual(["reconnecting"])
    vi.advanceTimersByTime(2_000)
    socket.reconnect()
    expect(seen).toEqual(["reconnecting", "back"])
    vi.advanceTimersByTime(BACK_FOR_MS)
    expect(seen).toEqual(["reconnecting", "back", "ok"])
  })

  it("passe au message « le serveur ne répond pas » apres une longue coupure", () => {
    const { socket, seen } = watch()
    socket.drop("ping timeout")
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual(["reconnecting", "lost"])
    socket.reconnect()
    expect(seen.at(-1)).toBe("back")
  })

  it("ignore une deconnexion voulue par le client", () => {
    const { socket, seen } = watch()
    socket.close("io client disconnect")
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual([])
  })

  it("ignore une fermeture par le serveur (socket.io ne se reconnecte pas)", () => {
    const { socket, seen } = watch()
    socket.close("io server disconnect")
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual([])
  })

  it("cache le bandeau si le client coupe pendant une reconnexion", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    socket.close()
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual(["reconnecting", "ok"])
  })

  it("cache le bandeau si le serveur refuse la reconnexion", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    socket.active = false
    socket.emit("connect_error", new Error("unauthorized"))
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual(["reconnecting", "ok"])
  })

  it("garde le bandeau pendant les essais reseau qui echouent", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    socket.emit("connect_error", new Error("xhr poll error"))
    expect(seen).toEqual(["reconnecting"])
  })

  it("n'affiche rien avant la toute premiere connexion", () => {
    const { socket, seen } = watch(fakeSocket(false))
    socket.active = true
    socket.emit("disconnect", "transport close")
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual([])
    // Premiere connexion, puis vraie coupure : la, on l'affiche.
    socket.reconnect()
    expect(seen).toEqual([])
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    expect(seen).toEqual(["reconnecting"])
  })

  it("une nouvelle coupure pendant « Reconnecté » repart proprement", () => {
    const { socket, seen } = watch()
    socket.drop()
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    socket.reconnect()
    socket.drop()
    expect(seen).toEqual(["reconnecting", "back", "ok"])
    vi.advanceTimersByTime(SHOW_AFTER_MS)
    expect(seen).toEqual(["reconnecting", "back", "ok", "reconnecting"])
  })

  it("l'arret retire les ecouteurs et les minuteries", () => {
    const { socket, seen, stop } = watch()
    socket.drop()
    stop()
    vi.advanceTimersByTime(LOST_AFTER_MS)
    expect(seen).toEqual([])
    expect(socket.count("connect") + socket.count("disconnect") + socket.count("connect_error")).toBe(0)
  })
})

describe("useConnectionStatus", () => {
  it("suit le socket courant quand il change", () => {
    const first = fakeSocket()
    const second = fakeSocket()
    const { result, rerender } = renderHook(({ socket }) => useConnectionStatus(socket), {
      initialProps: { socket: first as ReturnType<typeof fakeSocket> | null },
    })
    act(() => {
      first.drop()
      vi.advanceTimersByTime(SHOW_AFTER_MS)
    })
    expect(result.current).toBe("reconnecting")

    // disconnectSocket() puis getSocket() : un autre socket, on repart de zero.
    rerender({ socket: second })
    expect(result.current).toBe("ok")
    expect(first.count("disconnect")).toBe(0)
    act(() => {
      second.drop()
      vi.advanceTimersByTime(SHOW_AFTER_MS)
    })
    expect(result.current).toBe("reconnecting")

    rerender({ socket: null })
    expect(result.current).toBe("ok")
    expect(second.count("disconnect")).toBe(0)
  })

  it("revient a ok apres la reconnexion", () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useConnectionStatus(socket))
    act(() => {
      socket.drop()
      vi.advanceTimersByTime(SHOW_AFTER_MS)
    })
    expect(result.current).toBe("reconnecting")
    act(() => socket.reconnect())
    expect(result.current).toBe("back")
    act(() => { vi.advanceTimersByTime(BACK_FOR_MS) })
    expect(result.current).toBe("ok")
  })
})
