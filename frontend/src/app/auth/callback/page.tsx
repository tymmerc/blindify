"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import LayoutGradient from "@/components/LayoutGradient"
import Navbar from "@/components/Navbar"

export default function Callback() {
  const router = useRouter()

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const access = p.get("access_token")
    const refresh = p.get("refresh_token")
    if (access) localStorage.setItem("spotify_access_token", access)
    if (refresh) localStorage.setItem("spotify_refresh_token", refresh)
    router.replace("/menu")
  }, [router])

  return (
    <LayoutGradient>
      <Navbar />
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-gray-700">Connexion Spotify…</p>
      </div>
    </LayoutGradient>
  )
}
