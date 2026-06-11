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
    <div className="grid min-h-screen place-items-center text-[#2e2014]">
      <p className="font-display text-sm italic text-[#8a7558]">Redirection vers le mode streamer...</p>
    </div>
  )
}
