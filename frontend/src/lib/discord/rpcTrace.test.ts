// Trace des messages du client Discord avant le READY : le SDK jette sans rien
// dire un message d'une origine inattendue, un READY mal forme ou un CLOSE.
import { afterEach, describe, expect, it, vi } from "vitest"
import { traceRpcMessages } from "@/lib/discord/rpcTrace"

const post = (data: unknown, origin = "https://discord.com") =>
  window.dispatchEvent(new MessageEvent("message", { data, origin, source: window }))

let stop: (() => void) | null = null
afterEach(() => { stop?.(); stop = null })

describe("traceRpcMessages", () => {
  it("note l'origine, l'opcode et la commande, puis s'arrete au READY", () => {
    const log = vi.fn()
    stop = traceRpcMessages(log)
    post([1, { cmd: "DISPATCH", evt: "READY", nonce: null, data: { v: 1 } }])
    post([1, { cmd: "DISPATCH", evt: "READY", nonce: null, data: { v: 1 } }])
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith("rpc recu", { n: 1, origin: "https://discord.com", op: "FRAME", cmd: "DISPATCH", evt: "READY" })
  })

  it("un CLOSE dit son code et son message", () => {
    const log = vi.fn()
    stop = traceRpcMessages(log)
    post([2, { code: 4001, message: "Invalid client" }])
    expect(log).toHaveBeenCalledWith("rpc recu", expect.objectContaining({ op: "CLOSE", code: 4001, message: "Invalid client" }))
  })

  it("une erreur de Discord dit son code et son message", () => {
    const log = vi.fn()
    stop = traceRpcMessages(log)
    post([1, { cmd: "AUTHORIZE", evt: "ERROR", nonce: "n1", data: { code: 4006, message: "not authenticated" } }])
    expect(log).toHaveBeenCalledWith("rpc recu", expect.objectContaining({ evt: "ERROR", code: 4006, message: "not authenticated" }))
  })

  it("plafonne le nombre de lignes et ignore ce qui n'est pas du protocole", () => {
    const log = vi.fn()
    stop = traceRpcMessages(log, 3)
    post("bonjour")
    for (let i = 0; i < 10; i++) post([1, { cmd: "DISPATCH", evt: "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", nonce: null, data: {} }])
    expect(log).toHaveBeenCalledTimes(3)
  })
})
