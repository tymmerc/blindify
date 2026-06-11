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
      <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
        Chargement...
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-16">
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
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Config · Panel</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Para<em className="font-medium italic text-[#c65133]">metres</em>
          </h1>
        </div>

        <Section title="Compte" accent="#c65133">
          <SettingRow label="Nom d'utilisateur" description={displayName}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
          <SettingRow label="Email" description={email}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
        </Section>

        <Section title="Jeu" accent="#e0a32e">
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

        <Section title="Confidentialite" accent="#7d9471">
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

        <Section title="Notifications" accent="#a8b8c8">
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

        <Section title="Zone de danger" accent="#9c2f1d">
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

        <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
          Blindify v1.0.0 ·{" "}
          <span className="cursor-pointer text-[#6b573f] underline hover:text-[#c65133]">CGU</span>{" "}
          · <span className="cursor-pointer text-[#6b573f] underline hover:text-[#c65133]">Privacy</span>
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative h-7 w-14 rounded-full border-2 border-[#2e2014] transition"
      style={{
        background: checked ? "#c65133" : "#efe5d0",
      }}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-1 top-1 h-4 w-4 rounded-full border-2 border-[#2e2014] transition ${
          checked ? "translate-x-7 bg-[#f4ecdb]" : "bg-[#8a7558]"
        }`}
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
        className="appearance-none rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-2 pr-9 text-sm font-bold text-[#2e2014] outline-none transition hover:border-[#2e2014] focus:border-[#c65133]"
      >
        {options.map(option => (
          <option key={option} className="bg-[#f4ecdb] text-[#2e2014]">
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6b573f]">v</span>
    </div>
  )
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]">
      {children}
    </button>
  )
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-full border-[1.5px] border-[#9c2f1d] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9c2f1d] transition hover:bg-[#9c2f1d] hover:text-[#f4ecdb]">
      {children}
    </button>
  )
}
