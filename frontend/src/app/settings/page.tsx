"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { UserSummary } from "@/lib/types"
import { AccountMenu } from "@/components/AccountMenu"

export default function SettingsPage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    async function guard() {
      try {
        let me = await api.checkAuth()
        if (!active) return
        if (!me) {
          // Guest-first : on cree un invite au lieu de forcer le login.
          me = await api.ensureUserSession()
          if (!active) return
        }
        if (!me) return
        setUserPayload(me)
      } finally {
        if (active) setLoading(false)
      }
    }
    guard()
    return () => {
      active = false
    }
  }, [router])

  const user: UserSummary | null = userPayload?.user ?? null
  const displayName = user?.username || "Utilisateur"
  const email = user?.email || "Non renseigné"
  const isGuest = user?.provider === "guest"

  const handleLogout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    router.replace("/auth/login")
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Supprimer définitivement ton compte ? Toutes tes données (parties, imports, sessions) seront effacées. Cette action est irréversible."
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await api.deleteAccount()
      router.replace("/")
    } catch (err) {
      console.error("delete_account_failed", err)
      window.alert("La suppression a échoué. Réessaie dans un instant.")
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
        Chargement...
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-16">
      <AccountMenu active="settings" />
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Réglages</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Para<em className="font-medium italic text-[#c65133]">mètres</em>
          </h1>
        </div>

        <Section title="Compte" accent="#c65133">
          {isGuest ? (
            <div className="flex flex-col gap-3 rounded-md border-[1.5px] border-[#c65133] bg-[rgba(198,81,51,.08)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-base font-semibold text-[#2e2014]">Tu joues en invité</p>
                <p className="text-sm text-[#6b573f]">Ton pseudo et tes parties sont gardés sur cet appareil. Crée un compte pour les retrouver aussi sur ton ordi ou un autre téléphone.</p>
              </div>
              <Link href="/auth/login" className="shrink-0 rounded-full border-2 border-[#2e2014] bg-[#c65133] px-5 py-2.5 text-center text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]">
                Créer un compte
              </Link>
            </div>
          ) : (
            <>
              <SettingRow label="Nom d'utilisateur" description={displayName}>
                <span className="rounded-full border-[1.5px] border-[#7d9471] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4f6a45]">
                  Compte {user?.provider}
                </span>
              </SettingRow>
              {email !== "Non renseigné" && (
                <SettingRow label="Email" description={email}>
                  <span />
                </SettingRow>
              )}
              <SettingRow label="Session" description="Te déconnecter de ce compte sur cet appareil">
                <GhostButton onClick={handleLogout}>Se déconnecter</GhostButton>
              </SettingRow>
            </>
          )}
        </Section>

        <Section title="Tes données" accent="#7d9471">
          <SettingRow
            label="Ce qu'on garde"
            description="Ton pseudo, ton lien de musique et l'historique de tes parties. Rien d'autre, aucun tracking publicitaire."
          >
            <span />
          </SettingRow>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] text-[#8a7558]">
            <Link href="/confidentialite" className="underline decoration-[rgba(46,32,20,.3)] underline-offset-2 transition hover:text-[#2e2014]">
              Politique de confidentialité
            </Link>
            <Link href="/mentions-legales" className="underline decoration-[rgba(46,32,20,.3)] underline-offset-2 transition hover:text-[#2e2014]">
              Mentions légales
            </Link>
          </div>
        </Section>

        <Section title="Zone de danger" accent="#9c2f1d">
          <SettingRow label="Supprimer le compte" description="Supprimer définitivement ton compte et toutes tes données. Cette action est irréversible.">
            <DangerButton onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer mon compte"}
            </DangerButton>
          </SettingRow>
        </Section>

        <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
          Blindz v1.0.0
        </p>
      </div>
    </div>
  )
}

function Section({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      className="mb-6 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]"
      style={{ borderLeft: `6px solid ${accent}` }}
    >
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent === "#a8b8c8" || accent === "#e0a32e" ? "#6b573f" : accent }}>
        {title}
      </h2>
      <div className="divide-y divide-[rgba(46,32,20,.15)]">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-2xl space-y-1">
        <div className="font-display text-base font-semibold text-[#2e2014]">{label}</div>
        <p className="text-sm text-[#6b573f]">{description}</p>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}



function GhostButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#2e2014]"
    >
      {children}
    </button>
  )
}

function DangerButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border-[1.5px] border-[#9c2f1d] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9c2f1d] transition hover:bg-[#9c2f1d] hover:text-[#f4ecdb] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#9c2f1d]"
    >
      {children}
    </button>
  )
}
