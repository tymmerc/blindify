"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { api, type CurrentUserPayload } from "@/lib/api"
import type { FriendEntry, RoomInvitation } from "@/lib/types"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"
import { useFriends } from "@/hooks/useFriends"
import { useInvitations } from "@/hooks/useInvitations"

function accentLayer(accent: string, alpha: number): string {
  const hex = accent.replace("#", "")
  const bigint = parseInt(hex, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

type CTAProps = {
  label: string
  accent: string
  onClick: () => void
  disabled?: boolean
}

function AccentButton({ label, accent, onClick, disabled }: CTAProps) {
  const [hovered, setHovered] = useState(false)
  const accentFill = accentLayer(accent, 0.18)
  const backgroundImage = `linear-gradient(90deg, ${accentFill} 0%, transparent 55%), linear-gradient(270deg, ${accentFill} 0%, transparent 55%)`
  const backgroundPosition = hovered ? "0 0, 100% 0" : "-30% 0, 130% 0"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border px-4 py-2 text-sm font-semibold transition-[background-position,border-color,color] duration-200 disabled:opacity-50"
      style={{
        borderColor: accent,
        color: accent,
        backgroundImage,
        backgroundSize: "60% 100%, 60% 100%",
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundPosition,
      }}
    >
      {label}
    </button>
  )
}

function ModeHeader({
  label,
  accent,
  onReset,
}: {
  label: string
  accent: string
  onReset: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b0b0b] px-5 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-white/60">Mode actif</p>
        <p className="text-lg font-semibold" style={{ color: accent }}>
          {label}
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-full border border-white/12 px-3 py-1 text-xs font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white"
      >
        Changer de mode
      </button>
    </div>
  )
}

function InvitationsList({
  invitations,
  onAccept,
  onDecline,
}: {
  invitations: RoomInvitation[]
  onAccept: (id: number) => void
  onDecline: (id: number) => void
}) {
  if (!invitations.length) {
    return <p className="text-sm text-white/60">Aucune invitation en attente.</p>
  }
  return (
    <div className="space-y-3">
      {invitations.map(inv => (
        <div key={inv.id} className="rounded-xl border border-white/10 bg-[#0c0c0c] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{inv.fromUsername ?? "Invité"}</p>
              <p className="text-xs text-white/60">Room {inv.roomCode}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAccept(inv.id)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:border-white/35"
              >
                Accepter
              </button>
              <button
                type="button"
                onClick={() => onDecline(inv.id)}
                className="rounded-full border border-white/12 px-3 py-1 text-xs font-semibold text-white/70 hover:text-white"
              >
                Refuser
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FriendsList({ friends }: { friends: FriendEntry[] }) {
  const online = friends.filter(f => f.presence?.status && f.presence.status !== "offline")
  const offline = friends.filter(f => !f.presence || f.presence.status === "offline")
  if (!friends.length) {
    return <p className="text-sm text-white/60">Ajoute des amis pour lancer une partie privée.</p>
  }
  return (
    <div className="space-y-3">
      {[...online, ...offline].map(friend => {
        const status = friend.presence?.status ?? "offline"
        return (
          <div key={friend.userId} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0c0c0c] px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-white">{friend.username ?? `Joueur ${friend.userId}`}</p>
              <p className="text-xs text-white/60">{status === "offline" ? "Hors ligne" : status === "playing" ? "En jeu" : "En ligne"}</p>
            </div>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: status === "offline" ? "rgba(255,255,255,0.25)" : "#ec4899" }}
              aria-hidden
            />
          </div>
        )
      })}
    </div>
  )
}

function FriendsView({
  accent,
  router,
}: {
  accent: string
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0c0c0c] p-5">
        <h2 className="text-xl font-semibold text-white">Mode Amis</h2>
        <p className="text-sm text-white/65">Invite et joue entre potes.</p>
        <AccentButton label="Créer ou rejoindre une salle" accent={accent} onClick={() => router.push("/multiplayer")} />
      </div>
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: accent, backgroundColor: accentLayer(accent, 0.22) }}
      >
        <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
        <p className="mt-2 text-sm text-white/80">Une partie simple, rapide, entre personnes que tu connais.</p>
        <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
        
          <li>Tu invites tes amis ou tu rejoins leur salle</li>  
          <li>Les musiques sont choisies à partir des bibliothèques de chacun.</li>
          <li>Une musique démarre, chacun répond de son côté</li>
          <li>Les scores s’affichent, et ça chambre un peu</li>
        </ul>
      </div>
    </div>
  )
}

function EventView({ accent, router }: { accent: string; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0c0c0c] p-5">
        <h2 className="text-xl font-semibold text-white">Mode Événement</h2>
        <p className="text-sm text-white/65">Un écran, tout le monde suit.</p>
        <AccentButton label="Démarrer un événement" accent={accent} onClick={() => router.push("/multiplayer")} />
      </div>
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: accent, backgroundColor: accentLayer(accent, 0.22) }}
      >
        <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
        <p className="mt-2 text-sm text-white/80">Tout le monde regarde le même écran, tu mènes la partie.</p>
        <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
          <li>Tu lances l’événement</li>
          <li>Les morceaux viennent des bibliothèques des participants.</li>
          <li>La musique démarre pour tous en même temps</li>
          <li>Les joueurs répondent sur leur téléphone</li>
        </ul>
      </div>
    </div>
  )
}

function ChatView({ accent, router }: { accent: string; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0c0c0c] p-5">
        <h2 className="text-xl font-semibold text-white">Mode Chat</h2>
        <p className="text-sm text-white/65">Le chat joue avec toi.</p>
        <AccentButton label="Ouvrir le salon" accent={accent} onClick={() => router.push("/multiplayer")} />
      </div>
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: accent, backgroundColor: accentLayer(accent, 0.22) }}
      >
        <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
        <p className="mt-2 text-sm text-white/80">Le jeu avance, le chat réagit en direct.</p>
        <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
          <li>Tu démarres la partie</li>*
          <li>La musique est tirée des bibliothèques des joueurs présents.</li>
          <li>La musique tourne, le chat répond</li>
          <li>Les messages s’affichent au fil du jeu</li>
        </ul>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const router = useRouter()
  const { mode, accentColor, label, resetMode } = useMode()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const {
    loading: friendsLoading,
  } = useFriends()
  const { acceptInvitation, declineInvitation, consumeToast } = useInvitations()

  useEffect(() => {
    let active = true
    async function loadSession() {
      try {
        const me = await api.ensureUserSession("Invité")
        if (!active) return
        setUserPayload(me)
      } catch (err) {
        console.error("menu_session_failed", err)
        setSessionError("Impossible de récupérer la session.")
      } finally {
        if (active) setLoading(false)
      }
    }
    loadSession()
    return () => {
      active = false
    }
  }, [])

  const handleAcceptRoomInvite = async (invitationId: number) => {
    await acceptInvitation(invitationId)
    consumeToast(invitationId)
  }

  const handleDeclineRoomInvite = async (invitationId: number) => {
    await declineInvitation(invitationId)
    consumeToast(invitationId)
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
        <p className="text-sm text-white/70">Chargement…</p>
      </div>
    )
  }

  if (!mode) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
        <p className="text-sm text-white/70">Sélectionne un mode pour continuer.</p>
      </div>
    )
  }

  const renderContent = () => {
    if (mode === "friends") {
      return (
        <FriendsView
          accent={accentColor}
          router={router}
        />
      )
    }
    if (mode === "event") {
      return <EventView accent={accentColor} router={router} />
    }
    return <ChatView accent={accentColor} router={router} />
  }

  return (
    <ModeGate allowedModes={["friends", "event", "chat"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-8 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <ModeHeader label={label} accent={accentColor} onReset={() => { resetMode(); router.replace("/modes") }} />
          {sessionError ? <p className="text-sm text-red-400">{sessionError}</p> : null}
          {renderContent()}
          {friendsLoading ? <p className="text-xs text-white/60">Mise à jour…</p> : null}
        </div>
      </div>
    </ModeGate>
  )
}
