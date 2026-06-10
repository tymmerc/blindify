"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { UserSummary } from "@/lib/types"

const toggleDefaults = {
  prefetchLiked: true,
  notificationSound: true,
  publicProfile: true,
  leaderboard: true,
  shareActivity: false,
  invites: true,
  achievements: true,
  news: false,
}

function CornerFrame({ color }: { color: string }) {
  return (
    <>
      <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: color }} />
    </>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggles, setToggles] = useState(toggleDefaults)
  const [duration, setDuration] = useState("10 secondes")
  const [difficulty, setDifficulty] = useState("Normal")

  useEffect(() => {
    let active = true
    async function guard() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
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
  const email = user?.email || "Non renseigne"

  const updateToggle = (key: keyof typeof toggleDefaults) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff] text-glow-cyan">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#f8f0ff] pb-16">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10 hover:shadow-glow-cyan"
          >
            Retour
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">[ Config Panel ]</p>
          <h1 className="font-display text-4xl md:text-5xl uppercase tracking-[0.04em] text-glow-pink">Parametres</h1>
        </div>

        <Section title="Compte" accent="#ff2ec8">
          <SettingRow label="Nom d'utilisateur" description={displayName}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
          <SettingRow label="Email" description={email}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
        </Section>

        <Section title="Jeu" accent="#00f7ff">
          <SettingRow label="Duree des extraits" description="Temps d'ecoute pour deviner chaque morceau">
            <Select value={duration} onChange={setDuration} options={["5 secondes", "10 secondes", "15 secondes", "20 secondes"]} />
          </SettingRow>
          <SettingRow label="Difficulte" description="Niveau de difficulte des questions">
            <Select value={difficulty} onChange={setDifficulty} options={["Facile", "Normal", "Difficile"]} />
          </SettingRow>
          <SettingRow
            label="Son des notifications"
            description="Activer les sons pour les bonnes et mauvaises reponses"
          >
            <Toggle checked={toggles.notificationSound} onChange={() => updateToggle("notificationSound")} />
          </SettingRow>
        </Section>

        <Section title="Confidentialite" accent="#a855f7">
          <SettingRow label="Profil public" description="Permettre aux autres utilisateurs de voir votre profil">
            <Toggle checked={toggles.publicProfile} onChange={() => updateToggle("publicProfile")} />
          </SettingRow>
          <SettingRow label="Afficher dans les classements" description="Apparaitre dans les classements publics">
            <Toggle checked={toggles.leaderboard} onChange={() => updateToggle("leaderboard")} />
          </SettingRow>
          <SettingRow label="Partage d'activite" description="Partager automatiquement vos scores sur les reseaux sociaux">
            <Toggle checked={toggles.shareActivity} onChange={() => updateToggle("shareActivity")} />
          </SettingRow>
        </Section>

        <Section title="Notifications" accent="#ffea00">
          <SettingRow
            label="Invitations de jeu"
            description="Recevoir des notifications pour les invitations multijoueur"
          >
            <Toggle checked={toggles.invites} onChange={() => updateToggle("invites")} />
          </SettingRow>
          <SettingRow label="Nouveaux succes" description="Etre notifie lors du deblocage de succes">
            <Toggle checked={toggles.achievements} onChange={() => updateToggle("achievements")} />
          </SettingRow>
          <SettingRow label="Nouveautes" description="Recevoir des notifications sur les nouvelles fonctionnalites">
            <Toggle checked={toggles.news} onChange={() => updateToggle("news")} />
          </SettingRow>
        </Section>

        <Section title="Zone de danger" accent="#ff3868" variant="danger">
          <SettingRow label="Supprimer les donnees telechargees" description="Liberer l'espace de stockage en supprimant les morceaux telecharges">
            <DangerButton>Supprimer</DangerButton>
          </SettingRow>
          <SettingRow label="Reinitialiser les statistiques" description="Remettre a zero toutes vos statistiques et succes">
            <DangerButton>Reinitialiser</DangerButton>
          </SettingRow>
          <SettingRow label="Supprimer le compte" description="Supprimer definitivement votre compte et toutes vos donnees">
            <DangerButton>Supprimer</DangerButton>
          </SettingRow>
        </Section>

        <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#9b7fb8]/50">
          Blindify v1.0.0 .{" "}
          <span className="cursor-pointer text-[#9b7fb8] underline hover:text-[#00f7ff]">CGU</span>{" "}
          . <span className="cursor-pointer text-[#9b7fb8] underline hover:text-[#00f7ff]">Privacy</span>
        </p>
      </div>
    </div>
  )
}

function Section({
  title,
  accent,
  variant,
  children,
}: {
  title: string
  accent: string
  variant?: "danger"
  children: React.ReactNode
}) {
  return (
    <div
      className="relative mb-6 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6"
      style={{
        borderColor: `${accent}55`,
        boxShadow: `0 0 16px ${accent}1a, inset 0 0 8px ${accent}0a`,
      }}
    >
      <CornerFrame color={accent} />
      <h2
        className="mb-4 font-display text-sm uppercase tracking-[0.15em]"
        style={{
          color: accent,
          textShadow: `0 0 8px ${accent}aa`,
        }}
      >
        [ {title} ]
      </h2>
      <div className={variant === "danger" ? "divide-y divide-[#ff3868]/15" : "divide-y divide-[#ff2ec8]/10"}>{children}</div>
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
        <div className="font-display text-base uppercase tracking-[0.03em] text-[#f8f0ff]">{label}</div>
        <p className="text-sm text-[#9b7fb8]">{description}</p>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative h-7 w-14 rounded-full border transition"
      style={{
        borderColor: checked ? "#ff2ec8" : "rgba(155,127,184,0.25)",
        background: checked ? "rgba(255,46,200,0.85)" : "rgba(15,5,30,0.6)",
        boxShadow: checked ? "0 0 14px rgba(255,46,200,0.6), inset 0 0 6px rgba(0,247,255,0.3)" : "none",
      }}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full transition ${checked ? "translate-x-7 bg-[#f8f0ff]" : "bg-[#9b7fb8]"}`}
        style={{
          boxShadow: checked ? "0 0 8px rgba(255,255,255,0.6)" : "none",
        }}
      />
    </button>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="appearance-none rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.85)] px-4 py-2 font-mono text-sm uppercase tracking-[0.1em] text-[#00f7ff] outline-none transition focus:border-[#00f7ff] focus:shadow-[0_0_12px_rgba(0,247,255,0.4)] hover:border-[#00f7ff]/60"
      >
        {options.map(option => (
          <option key={option} className="bg-[#0a0014] text-[#f8f0ff]">
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[#00f7ff]">v</span>
    </div>
  )
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-[#00f7ff] transition hover:bg-[#00f7ff]/10 hover:border-[#00f7ff]/60 hover:shadow-[0_0_12px_rgba(0,247,255,0.3)]">
      {children}
    </button>
  )
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-sm border border-[#ff3868]/40 bg-[#ff3868]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-[#ff3868] transition hover:bg-[#ff3868]/20 hover:border-[#ff3868] hover:shadow-[0_0_14px_rgba(255,56,104,0.5)]">
      {children}
    </button>
  )
}
