"use client"

import Link from "next/link"
import { ArrowRight, Sparkles, Users, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { modeAccent } from "@/lib/uiTokens"
import type { LobbyRendererProps } from "./lobbyTypes"

function FriendsEntry({
  onHost,
  invites,
}: {
  onHost: () => void
  invites: LobbyRendererProps["invites"]
}) {
  const accent = modeAccent("friends")
  return (
    <section
      className="flex flex-col gap-5 rounded-3xl border bg-[var(--ma-surface)] p-10 shadow-[0_30px_70px_rgba(0,0,0,0.45)]"
      style={{ borderColor: accent, boxShadow: `0 20px 60px ${accent}33` }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Mode amis</p>
        <h2 className="text-4xl font-semibold leading-tight" style={{ color: accent }}>
          Crée une partie privée
        </h2>
        <p className="text-sm text-[var(--ma-muted)]">Invitations immédiates, duel entre proches. Pas de codes, juste vos noms.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Rivalité directe", "Prêts visibles", "Lancement en un clic"].map(point => (
          <span
            key={point}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-[6px] text-xs font-semibold text-slate-100"
            style={{ borderColor: accent, color: accent }}
          >
            {point}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Button onClick={onHost} className="ma-btn-primary gap-2 self-start rounded-xl px-5 py-3 text-sm shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
          <Sparkles className="h-4 w-4" />
          Créer une partie privée
        </Button>
        {invites.length > 0 ? (
          <p className="text-xs text-[var(--ma-muted)]">{invites.length} invitation(s) reçue(s) prêtes à rejoindre.</p>
        ) : (
          <p className="text-xs text-[var(--ma-muted)]">Tes amis verront ton invitation dès l’ouverture.</p>
        )}
      </div>
      <Link href="/modes" className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)] hover:text-white transition">
        Changer de mode
      </Link>
    </section>
  )
}

function FriendsLobby({
  participants,
  invites,
  onAcceptInvite,
  friends,
  friendsLoading,
  friendsError,
  onInviteFriend,
  onStart,
  starting,
  canStart,
  isHost,
}: LobbyRendererProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="rounded-3xl border border-white/10 bg-[var(--ma-surface)] p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Rivalité active</p>
            <h3 className="text-2xl font-semibold text-white">Prêts / pas prêts</h3>
            <p className="text-sm text-[var(--ma-muted)]">On lance dès que vos rivaux sont alignés.</p>
          </div>
          <Button
            onClick={onStart}
            disabled={starting || !canStart}
            className="ma-btn-primary gap-2 rounded-xl px-5 py-3 disabled:opacity-60"
          >
            {isHost ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {isHost ? "Lancer la partie" : "En attente de l’hôte"}
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          {participants.map(participant => (
            <div
              key={participant.user_id}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-white">{participant.username || `Ami ${participant.user_id}`}</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted)]">
                  {canStart ? "Prêt" : "En chauffe"}
                </span>
              </div>
              <span className="text-xs text-[var(--ma-muted)]">#{participant.user_id}</span>
            </div>
          ))}
          {participants.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">
              En attente de tes rivaux.
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-black/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ma-muted)]">Invitations</p>
              <h4 className="text-lg font-semibold text-white">Amis invités</h4>
            </div>
            <span className="text-xs text-[var(--ma-muted)]">{friendsLoading ? "..." : `${friends.filter(f => f.status === "accepted").length} prêts`}</span>
          </div>
          {friendsError ? (
            <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{friendsError}</div>
          ) : null}
          <div className="mt-4 space-y-2">
            {friends
              .filter(friend => friend.status === "accepted")
              .map(friend => (
                <div
                  key={friend.userId}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <div className="flex flex-col">
                    <span className="truncate font-semibold">{friend.username || `Ami ${friend.userId}`}</span>
                    <span className="text-[11px] text-[var(--ma-muted)]">Invite directe</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onInviteFriend(friend.userId)}
                    className="shrink-0 gap-1"
                    aria-label={`Inviter ${friend.username || "ami"}`}
                  >
                    <Share2 className="h-4 w-4" />
                    Envoyer
                  </Button>
                </div>
              ))}
            {!friendsLoading && friends.filter(f => f.status === "accepted").length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-[var(--ma-muted)]">
                Invite tes rivaux pour lancer plus vite.
              </div>
            ) : null}
          </div>
        </div>

        {invites.length > 0 ? (
          <div className="rounded-3xl border border-white/10 bg-black/60 p-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ma-muted)]">Invitations reçues</h4>
              <span className="text-xs text-[var(--ma-muted)]">{invites.length}</span>
            </div>
            <div className="mt-3 grid gap-3">
              {invites.map(invite => (
                <div key={invite.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                  <div className="flex flex-col">
                    <span className="font-semibold">{invite.fromUsername || "Ami"}</span>
                    <span className="text-[11px] text-[var(--ma-muted)]">Prêt à te défier</span>
                  </div>
                  <Button size="sm" onClick={() => onAcceptInvite(invite.id)} className="gap-2 rounded-full px-4">
                    <Users className="h-4 w-4" />
                    Rejoindre
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function FriendsLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return <FriendsEntry onHost={props.onHost} invites={props.invites} />
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <FriendsLobby {...props} />
  }

  return null
}
