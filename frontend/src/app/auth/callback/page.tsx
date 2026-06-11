"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
export default function AuthCallbackPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/modes") }, [router])
  return <div className="grid min-h-screen place-items-center font-display text-sm italic text-[#6b573f]">Redirection...</div>
}
