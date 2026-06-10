import { useEffect, useState, useCallback } from "react"
import type { Socket } from "socket.io-client"
import type { ChatMessage } from "@/components/game/MultiplayerGameClient"

interface RoomChatPayload {
  userId: number
  username: string
  message: string
  timestamp: number
}

interface UseRoomChat {
  messages: ChatMessage[]
  sendChat: (message: string) => void
}

/**
 * Manage room chat: listen for incoming messages, expose a send function.
 *
 * Keeps the last 100 messages in memory. The listener auto-attaches when the
 * socket and roomCode are both ready, and cleans up on unmount or change.
 */
export function useRoomChat(socket: Socket | null, roomCode: string | null): UseRoomChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!socket || !roomCode) return
    const handler = (payload: RoomChatPayload) => {
      setMessages(prev => [...prev, payload].slice(-100))
    }
    socket.on("room:chat", handler)
    return () => {
      socket.off("room:chat", handler)
    }
  }, [socket, roomCode])

  // Reset messages when the room changes.
  useEffect(() => {
    setMessages([])
  }, [roomCode])

  const sendChat = useCallback(
    (message: string) => {
      if (!socket || !roomCode) return
      const trimmed = message.trim()
      if (!trimmed) return
      socket.emit("room:chat", { roomCode, message: trimmed })
    },
    [socket, roomCode]
  )

  return { messages, sendChat }
}
