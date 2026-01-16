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
    <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
      <p className="text-sm">Redirection vers le mode streamer...</p>
    </div>
  )
}
