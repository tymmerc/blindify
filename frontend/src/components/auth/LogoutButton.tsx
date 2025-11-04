"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { clientApi } from "@/lib/apiClient"

export function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    try {
      setLoading(true)
      await clientApi.logout()
      router.replace("/")
      router.refresh()
    } catch (err) {
      console.error("logout_failed", err)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? "Déconnexion…" : "Se déconnecter"}
    </button>
  )
}
