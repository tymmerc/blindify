import { io, Socket } from "socket.io-client"
import { API_BASE_URL } from "./config"

let socket: Socket | null = null

function getSessionToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|; )blindify_session_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

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
    const sessionToken = getSessionToken()
    socket = io(origin, {
      withCredentials: true,
      path,
      transports: ["websocket", "polling"],
      ...(sessionToken
        ? {
            auth: { token: sessionToken },
            extraHeaders: { Authorization: `Bearer ${sessionToken}` },
          }
        : {}),
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
