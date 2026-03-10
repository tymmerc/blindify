"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function MenuPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/friends")
  }, [router])

  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
      <p className="text-sm text-white/70">Redirection...</p>
    </div>
  )
}
