import { io, Socket } from "socket.io-client"
import { API_BASE_URL } from "./config"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : API_BASE_URL.replace(/\/blindify$/, "")
    // Use base path for socket to avoid proxy issues in subpaths
    const path =
      API_BASE_URL.includes("/blindify") || (typeof window !== "undefined" && window.location.pathname.startsWith("/blindify"))
        ? "/blindify/socket.io"
        : "/socket.io"
    socket = io(origin, {
      withCredentials: true,
      path,
      transports: ["websocket", "polling"],
      // Session cookie is HttpOnly — authentication is handled automatically
      // via withCredentials sending the cookie in the handshake headers.
    })
    socket.on("connect_error", (err) => {
      console.error(`[socket] connect_error: ${err.message}`)
    })
  }
  return socket
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
