"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export const ACCOUNT_PATH = "/profile/"

// Anciennes adresses /stats, /history et /settings : tout est sur l'ecran
// « Mon compte » depuis le 05/11/2026. Le site est exporte en statique, donc
// pas de redirection serveur : on renvoie depuis le navigateur.
export function GoToAccount() {
  const router = useRouter()
  useEffect(() => {
    router.replace(ACCOUNT_PATH)
  }, [router])
  return (
    <div className="grid min-h-screen place-items-center text-sm text-[#8a7558]">
      <Link href={ACCOUNT_PATH} className="underline underline-offset-4">
        Mon compte
      </Link>
    </div>
  )
}
