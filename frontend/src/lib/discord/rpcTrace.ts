import type { DiscordLog } from "./log"

/**
 * Trace des messages du client Discord jusqu'au READY. Le SDK jette sans un
 * mot un message d'une origine qu'il ne connait pas, un READY qu'il n'arrive
 * pas a lire ou un CLOSE : sans cette trace, « Discord ne repond pas » ne dit
 * pas si Discord a repondu.
 *
 * S'arrete au READY : ensuite le SDK renvoie chaque console.* au client, qui
 * repond par un message, qu'on journaliserait, et ainsi de suite.
 */
const OPCODES = ["HANDSHAKE", "FRAME", "CLOSE", "HELLO"]

export function traceRpcMessages(log: DiscordLog, max = 30): () => void {
  let n = 0
  const stop = () => window.removeEventListener("message", onMessage)
  function onMessage(event: MessageEvent) {
    if (!Array.isArray(event.data)) return
    const [opcode, payload] = event.data as [unknown, Record<string, unknown> | undefined]
    n += 1
    const line: Record<string, unknown> = { n, origin: event.origin, op: OPCODES[opcode as number] ?? String(opcode) }
    const data = (payload?.data ?? null) as Record<string, unknown> | null
    if (payload && typeof payload === "object") {
      if (payload.cmd !== undefined) line.cmd = payload.cmd
      if (payload.evt !== undefined && payload.evt !== null) line.evt = payload.evt
      if (opcode === 2) {
        line.code = payload.code
        line.message = payload.message
      }
      if (payload.evt === "ERROR" && data) {
        line.code = data.code
        line.message = data.message
      }
    }
    log("rpc recu", line)
    if ((payload?.cmd === "DISPATCH" && payload?.evt === "READY") || n >= max) stop()
  }
  window.addEventListener("message", onMessage)
  return stop
}
