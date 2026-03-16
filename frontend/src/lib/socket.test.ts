import { beforeEach, describe, expect, it, vi } from "vitest"

const mockDisconnect = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

function createMockSocket() {
  return {
    connected: false,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
    emit: vi.fn(),
  }
}

const mockIo = vi.fn(() => createMockSocket())

vi.mock("socket.io-client", () => ({
  io: mockIo,
}))

describe("socket", () => {
  beforeEach(() => {
    vi.resetModules()
    mockIo.mockClear()
    mockDisconnect.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
    mockIo.mockImplementation(() => createMockSocket())
  })

  async function loadSocket() {
    const mod = await import("@/lib/socket")
    return mod
  }

  it("getSocket() returns a socket instance", async () => {
    const { getSocket } = await loadSocket()
    const socket = getSocket()
    expect(socket).toBeDefined()
    expect(socket).toHaveProperty("disconnect")
    expect(socket).toHaveProperty("on")
    expect(mockIo).toHaveBeenCalledTimes(1)
  })

  it("getSocket() returns same instance on second call (singleton)", async () => {
    const { getSocket } = await loadSocket()
    const socket1 = getSocket()
    const socket2 = getSocket()
    expect(socket1).toBe(socket2)
    expect(mockIo).toHaveBeenCalledTimes(1)
  })

  it("disconnectSocket() disconnects and clears singleton", async () => {
    const { getSocket, disconnectSocket } = await loadSocket()

    const socket = getSocket()
    expect(socket).toBeDefined()

    disconnectSocket()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)

    // After disconnect, getSocket() should create a new instance
    const newSocket = getSocket()
    expect(mockIo).toHaveBeenCalledTimes(2)
    expect(newSocket).not.toBe(socket)
  })

  it("disconnectSocket() does nothing if no socket exists", async () => {
    const { disconnectSocket } = await loadSocket()
    disconnectSocket()
    expect(mockDisconnect).not.toHaveBeenCalled()
  })

  it("getSocket() registers a connect_error handler", async () => {
    const { getSocket } = await loadSocket()
    getSocket()
    expect(mockOn).toHaveBeenCalledWith("connect_error", expect.any(Function))
  })
})
