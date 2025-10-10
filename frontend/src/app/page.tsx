"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    router.push("/menu")
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gradient-purple-pink mb-4">Blindify</h1>
        <p className="text-xl text-muted-foreground">Chargement...</p>
      </div>
    </div>
  )
}
