"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ChatRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect old chat mode to streamer
    router.replace("/streamer")
  }, [router])

  return (
    <div className="grid min-h-screen place-items-center text-ink">
      <p className="font-display text-sm italic text-sourd">Redirection vers le mode streamer...</p>
    </div>
  )
}
