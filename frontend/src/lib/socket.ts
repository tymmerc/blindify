import { io, Socket } from "socket.io-client"
import { API_BASE_URL } from "./config"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE_URL, {
      withCredentials: true,
      transports: ["websocket"],
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
