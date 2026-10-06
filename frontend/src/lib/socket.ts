import { io, Socket } from "socket.io-client"
import { API_BASE_URL } from "./config"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : API_BASE_URL.replace(/\/blindify$/, "")
    const path =
      API_BASE_URL.includes("/blindify") || (typeof window !== "undefined" && window.location.pathname.startsWith("/blindify"))
        ? "/blindify/socket.io"
        : "/socket.io"
    socket = io(origin, {
      withCredentials: true,
      path,
      transports: ["polling", "websocket"],
      autoConnect: false,
    })
    socket.on("connect_error", (err) => {
      console.error(`[socket] connect_error: ${err.message}`)
    })
  }
  return socket
}

/** Ce dont connectIfIdle a besoin d'un socket (un faux suffit dans les tests). */
export type ConnectableSocket = Pick<Socket, "connected" | "active"> & { connect: () => unknown }

/**
 * Lance la connexion seulement si le socket est au repos. Renvoie true si
 * connect() a ete appele.
 *
 * `connected` ne suffit pas pour le savoir. Entre l'ouverture du transport et
 * la reponse du serveur au CONNECT (un aller-retour reseau plus la lecture de
 * la session en base), le socket n'est pas encore `connected` mais il est deja
 * `active`. Rappeler connect() dans ce creneau envoie un second CONNECT, que
 * socket.io 4 traite comme un etat invalide : le serveur ferme toute la
 * connexion. Le room:join parti entre-temps est perdu (POST en 400 "Session ID
 * unknown"), la sonde websocket est coupee, et le client attend sa reconnexion
 * automatique (1 s ou plus, davantage a chaque echec). Mesure sur la pile de
 * test le 05/10/2026 (tools/test-stack/webkit-lobby.mjs) : un CONNECT en double
 * dans 178 entrees en salle sur 202, sous WebKit comme sous Chromium.
 * `active` reste vrai pendant une reconnexion automatique : socket.io s'en
 * charge, il ne faut pas la doubler.
 */
export function connectIfIdle(target: ConnectableSocket): boolean {
  if (target.connected || target.active) return false
  target.connect()
  return true
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect()
    } finally {
      socket = null
    }
  }
}
