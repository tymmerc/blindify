"use client"

import { useEffect } from "react"

export default function RootRedirect() {
  useEffect(() => {
    window.location.replace("/blindify/modes")
  }, [])

  return (
    <div className="grid min-h-screen place-items-center font-display text-sm italic text-[#6b573f]">
      Redirection...
    </div>
  )
}
