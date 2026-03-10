"use client"

import { useEffect } from "react"

export default function RootRedirect() {
  useEffect(() => {
    window.location.replace("/blindify/modes")
  }, [])

  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-white/70">
      Redirection...
    </div>
  )
}
