import { useEffect, useState } from "react"

/**
 * Etat de la connexion temps reel tel que le joueur doit le voir :
 * - "ok" : rien a afficher ;
 * - "reconnecting" : coupe depuis plus de SHOW_AFTER_MS, socket.io retente seul ;
 * - "lost" : coupe depuis plus de LOST_AFTER_MS ;
 * - "back" : la connexion vient de revenir apres une coupure affichee.
 */
export type ConnectionStatus = "ok" | "reconnecting" | "lost" | "back"

/** Une coupure plus courte ne s'affiche pas (pas de clignotement). */
export const SHOW_AFTER_MS = 1_000
export const LOST_AFTER_MS = 20_000
/** Duree du « Reconnecté » au retour. */
export const BACK_FOR_MS = 1_500

/** Ce que la surveillance lit d'un socket (un faux suffit dans les tests). */
export type WatchedSocket = {
  readonly connected: boolean
  readonly active: boolean
  on(event: "connect" | "disconnect" | "connect_error", listener: (...args: never[]) => void): unknown
  off(event: "connect" | "disconnect" | "connect_error", listener: (...args: never[]) => void): unknown
}

/**
 * Suit un socket et appelle onChange a chaque changement d'etat. Renvoie la
 * fonction qui arrete tout (ecouteurs et minuteries).
 *
 * Seule une coupure que socket.io va reparer s'affiche : apres "io client
 * disconnect" (disconnectSocket(), page quittee) ou "io server disconnect"
 * (le serveur a ferme expres), `active` est faux et rien ne se reconnecte.
 */
export function watchConnection(socket: WatchedSocket, onChange: (status: ConnectionStatus) => void): () => void {
  let status: ConnectionStatus = "ok"
  let everConnected = socket.connected
  let timers: ReturnType<typeof setTimeout>[] = []

  const set = (next: ConnectionStatus) => {
    if (next === status) return
    status = next
    onChange(next)
  }
  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers = []
  }
  const hide = () => {
    clearTimers()
    set("ok")
  }

  const onConnect = () => {
    everConnected = true
    const wasShown = status === "reconnecting" || status === "lost"
    clearTimers()
    if (!wasShown) return set("ok")
    set("back")
    timers.push(setTimeout(() => set("ok"), BACK_FOR_MS))
  }
  const onDisconnect = (reason?: string) => {
    if (!everConnected || reason === "io client disconnect" || !socket.active) return hide()
    clearTimers()
    if (status === "back") set("ok")
    timers.push(
      setTimeout(() => set("reconnecting"), SHOW_AFTER_MS),
      setTimeout(() => set("lost"), LOST_AFTER_MS),
    )
  }
  // Refus du serveur pendant une reconnexion : socket.io abandonne, l'ecran
  // affiche deja sa propre erreur.
  const onConnectError = () => {
    if (!socket.active) hide()
  }

  socket.on("connect", onConnect)
  socket.on("disconnect", onDisconnect)
  socket.on("connect_error", onConnectError)
  return () => {
    clearTimers()
    socket.off("connect", onConnect)
    socket.off("disconnect", onDisconnect)
    socket.off("connect_error", onConnectError)
  }
}

/**
 * Etat de connexion du socket donne. Suit le socket courant : un autre socket
 * (disconnectSocket() puis getSocket()) repart de "ok" et l'ancien n'est plus ecoute.
 */
export function useConnectionStatus(socket: WatchedSocket | null): ConnectionStatus {
  const [state, setState] = useState<{ socket: WatchedSocket | null; status: ConnectionStatus }>({ socket: null, status: "ok" })

  useEffect(() => {
    if (!socket) return
    return watchConnection(socket, status => setState({ socket, status }))
  }, [socket])

  return state.socket === socket ? state.status : "ok"
}
