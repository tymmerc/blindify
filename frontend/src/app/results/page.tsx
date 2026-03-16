"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ResultsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/solo")
  }, [router])

  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/70">
      Redirection...
    </div>
  )
}
