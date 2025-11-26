"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
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
  const displayName = user?.username || "Jean Dupont"
  const email = user?.email || "jean.dupont@email.com"

  const usedStorage = 164
  const totalStorage = 387
  const storagePercent = useMemo(() => Math.round((usedStorage / totalStorage) * 100), [usedStorage, totalStorage])

  const updateToggle = (key: keyof typeof toggleDefaults) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm uppercase tracking-[0.3em] text-[var(--ma-muted)]">
        Chargement
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white pb-16">
      <div className="ma-container">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            ← Retour
          </Link>
        </div>

        <h1 className="mb-10 text-4xl font-bold tracking-[-0.04em]">Paramètres</h1>

        <Section title="Compte">
          <SettingRow label="Nom d'utilisateur" description={displayName}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
          <SettingRow label="Email" description={email}>
            <GhostButton>Modifier</GhostButton>
          </SettingRow>
          <SettingRow label="Compte Spotify" description="Connecté">
            <GhostButton>Déconnecter</GhostButton>
          </SettingRow>
        </Section>

        <Section title="Jeu">
          <SettingRow
            label="Télécharger les titres likés en avance"
            description="Précharge vos morceaux favoris pour un démarrage instantané des parties"
          >
            <Toggle checked={toggles.prefetchLiked} onChange={() => updateToggle("prefetchLiked")} />
          </SettingRow>

          <div className="rounded-xl border border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.08)] px-4 py-4">
            <div className="flex items-center justify-between text-sm text-[var(--ma-muted)]">
              <span>Espace utilisé</span>
              <span>
                {usedStorage} MB / {totalStorage} MB
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${storagePercent}%`, backgroundImage: "var(--ma-gradient)" }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--ma-muted)]">
              Les morceaux sont téléchargés automatiquement lorsque vous êtes connecté au Wi-Fi
            </p>
          </div>

          <SettingRow label="Durée des extraits" description="Temps d'écoute pour deviner chaque morceau">
            <Select value={duration} onChange={setDuration} options={["5 secondes", "10 secondes", "15 secondes", "20 secondes"]} />
          </SettingRow>
          <SettingRow label="Difficulté" description="Niveau de difficulté des questions">
            <Select value={difficulty} onChange={setDifficulty} options={["Facile", "Normal", "Difficile"]} />
          </SettingRow>
          <SettingRow
            label="Son des notifications"
            description="Activer les sons pour les bonnes et mauvaises réponses"
          >
            <Toggle checked={toggles.notificationSound} onChange={() => updateToggle("notificationSound")} />
          </SettingRow>
        </Section>

        <Section title="Confidentialité">
          <SettingRow label="Profil public" description="Permettre aux autres utilisateurs de voir votre profil">
            <Toggle checked={toggles.publicProfile} onChange={() => updateToggle("publicProfile")} />
          </SettingRow>
          <SettingRow label="Afficher dans les classements" description="Apparaître dans les classements publics">
            <Toggle checked={toggles.leaderboard} onChange={() => updateToggle("leaderboard")} />
          </SettingRow>
          <SettingRow label="Partage d'activité" description="Partager automatiquement vos scores sur les réseaux sociaux">
            <Toggle checked={toggles.shareActivity} onChange={() => updateToggle("shareActivity")} />
          </SettingRow>
        </Section>

        <Section title="Notifications">
          <SettingRow
            label="Invitations de jeu"
            description="Recevoir des notifications pour les invitations multijoueur"
          >
            <Toggle checked={toggles.invites} onChange={() => updateToggle("invites")} />
          </SettingRow>
          <SettingRow label="Nouveaux succès" description="Être notifié lors du déblocage de succès">
            <Toggle checked={toggles.achievements} onChange={() => updateToggle("achievements")} />
          </SettingRow>
          <SettingRow label="Nouveautés" description="Recevoir des notifications sur les nouvelles fonctionnalités">
            <Toggle checked={toggles.news} onChange={() => updateToggle("news")} />
          </SettingRow>
        </Section>

        <Section title="Zone de danger" variant="danger">
          <SettingRow label="Supprimer les données téléchargées" description="Libérer l'espace de stockage en supprimant les morceaux téléchargés">
            <DangerButton>Supprimer</DangerButton>
          </SettingRow>
          <SettingRow label="Réinitialiser les statistiques" description="Remettre à zéro toutes vos statistiques et succès">
            <DangerButton>Réinitialiser</DangerButton>
          </SettingRow>
          <SettingRow label="Supprimer le compte" description="Supprimer définitivement votre compte et toutes vos données">
            <DangerButton>Supprimer</DangerButton>
          </SettingRow>
        </Section>

        <p className="mt-8 text-center text-xs text-[#606060]">
          Blindify v1.0.0 ·{" "}
          <span className="cursor-pointer text-[var(--ma-muted)] underline hover:text-white">Conditions d&apos;utilisation</span>{" "}
          · <span className="cursor-pointer text-[var(--ma-muted)] underline hover:text-white">Confidentialité</span>
        </p>
      </div>
    </div>
  )
}

function Section({
  title,
  variant,
  children,
}: {
  title: string
  variant?: "danger"
  children: React.ReactNode
}) {
  return (
    <div className={`mb-6 rounded-xl border ${variant === "danger" ? "border-[rgba(244,67,54,0.3)]" : "border-[var(--ma-border)]"} bg-[var(--ma-surface)] p-6`}>
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="divide-y divide-[var(--ma-border)]">{children}</div>
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
        <div className="text-base font-semibold">{label}</div>
        <p className="text-sm text-[var(--ma-muted)]">{description}</p>
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
      className={`relative h-7 w-14 rounded-full border border-[var(--ma-border-strong)] transition ${
        checked ? "" : "bg-white/10"
      }`}
      style={checked ? { backgroundImage: "var(--ma-gradient)" } : {}}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition ${
          checked ? "translate-x-7" : ""
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
        className="appearance-none rounded-lg border border-[var(--ma-border-strong)] bg-white/5 px-4 py-2 text-sm font-medium outline-none transition focus:border-[rgba(168,85,247,0.5)]"
      >
        {options.map(option => (
          <option key={option} className="bg-[var(--ma-bg)] text-white">
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ma-muted)]">▼</span>
    </div>
  )
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5">
      {children}
    </button>
  )
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-lg border border-[rgba(244,67,54,0.3)] px-4 py-2 text-sm font-semibold text-[#f44336] transition hover:bg-[rgba(244,67,54,0.16)]">
      {children}
    </button>
  )
}
