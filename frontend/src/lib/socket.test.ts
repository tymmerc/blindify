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

// Etats d'un socket socket.io-client tels que les voit connectIfIdle :
// au repos (jamais connecte, ou deconnecte a la main / par le serveur), en
// poignee de main ou en reconnexion automatique (active, pas encore connected),
// connecte.
function fakeSocket(state: { connected: boolean; active: boolean }) {
  return { ...state, connect: vi.fn() }
}

describe("connectIfIdle", () => {
  it("connecte un socket au repos", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: false, active: false })
    expect(connectIfIdle(s)).toBe(true)
    expect(s.connect).toHaveBeenCalledTimes(1)
  })

  it("ne relance rien pendant la poignee de main (second CONNECT : le serveur fermait tout)", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    // Transport ouvert, CONNECT envoye, reponse du serveur pas encore arrivee :
    // un second connect() enverrait un second CONNECT et le serveur fermerait tout.
    const s = fakeSocket({ connected: false, active: true })
    expect(connectIfIdle(s)).toBe(false)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("laisse socket.io gerer sa reconnexion automatique", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: false, active: true })
    // Plusieurs rendus pendant la coupure : aucun connect() en plus.
    connectIfIdle(s)
    connectIfIdle(s)
    connectIfIdle(s)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("ne touche pas un socket deja connecte", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    const s = fakeSocket({ connected: true, active: true })
    expect(connectIfIdle(s)).toBe(false)
    expect(s.connect).not.toHaveBeenCalled()
  })

  it("suit le cycle de vie : un seul connect() par connexion, puis de nouveau apres un disconnect()", async () => {
    const { connectIfIdle } = await import("@/lib/socket")
    // Comme socket.io-client : connect() rend le socket actif, disconnect() le remet au repos.
    const s = { connected: false, active: false, connect: vi.fn(() => { s.active = true }) }
    connectIfIdle(s) // premier rendu
    connectIfIdle(s) // nouvel utilisateur pendant la poignee de main
    connectIfIdle(s) // entree en salle, toujours avant la reponse du serveur
    expect(s.connect).toHaveBeenCalledTimes(1)
    s.connected = true
    connectIfIdle(s)
    expect(s.connect).toHaveBeenCalledTimes(1)
    s.connected = false
    s.active = false // disconnect() volontaire
    expect(connectIfIdle(s)).toBe(true)
    expect(s.connect).toHaveBeenCalledTimes(2)
  })
})

// Activite Discord : la page est a l'origine du proxy de Discord, pas a celle
// de l'API. Le socket doit viser l'origine de l'API (le SDK reecrit ensuite
// l'adresse vers le proxy) et porter le jeton de session dans le handshake,
// faute de cookie. Tout le reste (autoConnect: false, transports) ne bouge pas.
describe("configureSocket", () => {
  beforeEach(() => {
    vi.resetModules()
    mockIo.mockClear()
    mockIo.mockImplementation(() => createMockSocket())
  })

  it("sans configuration : origine de la page, chemin habituel, pas d'auth", async () => {
    const { getSocket } = await import("@/lib/socket")
    getSocket()
    const [origin, opts] = mockIo.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(origin).toBe(window.location.origin)
    expect(opts.autoConnect).toBe(false)
    expect(opts.auth).toBeUndefined()
  })

  it("avec configuration : origine, chemin et jeton de la configuration, autoConnect toujours coupe", async () => {
    const { configureSocket, getSocket } = await import("@/lib/socket")
    configureSocket({ origin: "https://blindz.app", path: "/socket.io", auth: { token: "sess-42" } })
    getSocket()
    const [origin, opts] = mockIo.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(origin).toBe("https://blindz.app")
    expect(opts.path).toBe("/socket.io")
    expect(opts.auth).toEqual({ token: "sess-42" })
    expect(opts.autoConnect).toBe(false)
    expect(opts.withCredentials).toBe(true)
  })

  it("la configuration survit a disconnectSocket() : le socket recree la garde", async () => {
    const { configureSocket, getSocket, disconnectSocket } = await import("@/lib/socket")
    configureSocket({ origin: "https://blindz.app", path: "/socket.io", auth: { token: "sess-42" } })
    getSocket()
    disconnectSocket()
    getSocket()
    expect(mockIo).toHaveBeenCalledTimes(2)
    const [, opts] = mockIo.mock.calls[1] as unknown as [string, Record<string, unknown>]
    expect(opts.auth).toEqual({ token: "sess-42" })
  })

  it("configureSocket() ne modifie pas l'objet passe et se remet a zero", async () => {
    const { configureSocket, getSocket, resetSocketConfig } = await import("@/lib/socket")
    const given = { origin: "https://blindz.app", auth: { token: "a" } }
    configureSocket(given)
    given.auth.token = "b"
    getSocket()
    expect((mockIo.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].auth).toEqual({ token: "a" })
    resetSocketConfig()
    const { disconnectSocket } = await import("@/lib/socket")
    disconnectSocket()
    getSocket()
    expect((mockIo.mock.calls[1] as unknown as [string, Record<string, unknown>])[1].auth).toBeUndefined()
  })
})
