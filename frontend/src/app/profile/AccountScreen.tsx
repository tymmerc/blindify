"use client"

import { accentTexte } from "@/lib/accentText"
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { api } from "@/lib/api"
import type { GameHistoryEntry, UserSummary } from "@/lib/types"
import { initialPseudo, statsLine } from "@/lib/accountView"
import { NICKNAME_KEY, readStored } from "@/lib/soloSetup"
import { openBugReport } from "@/components/BugReportDialog"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { PseudoField } from "@/components/account/PseudoField"
import { RecentGames } from "@/components/account/RecentGames"
import { KeepMyInfo } from "@/components/account/KeepMyInfo"
import { AppearanceChoice } from "@/components/account/AppearanceChoice"
import { PhotoPicker } from "@/components/account/PhotoPicker"
import { useProfilePhoto } from "@/components/account/useProfilePhoto"

const CORAL = "#c65133"

type Loaded = {
  user: UserSummary | null
  games: GameHistoryEntry[] | null
  stats: string | null
}

// Ecran unique « Mon compte » (remplace Profil, Stats, Historique et Reglages,
// decision de Tym du 05/11/2026). Ouvrir la page ne cree plus d'invite : un
// visiteur sans session voit son pseudo et les liens, rien d'autre.
export function AccountScreen() {
  const router = useRouter()
  const [data, setData] = useState<Loaded | null>(null)
  const [pseudo, setPseudo] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const photo = useProfilePhoto()
  const { setOnline: setOnlinePhoto } = photo

  useEffect(() => {
    let active = true
    async function load() {
      const me = await api.checkAuth().catch(() => null)
      const user = me?.user ?? null
      if (!active) return
      setPseudo(initialPseudo(readStored(NICKNAME_KEY), user?.username))
      setOnlinePhoto(user?.avatar ?? null)
      if (!user) {
        setData({ user: null, games: [], stats: null })
        return
      }
      const [history, stats] = await Promise.allSettled([api.gameHistoryDetailed(), api.detailedStats()])
      if (!active) return
      setData({
        user,
        games: history.status === "fulfilled" ? history.value?.games ?? [] : null,
        stats: stats.status === "fulfilled" ? statsLine(stats.value?.stats) : null,
      })
    }
    void load()
    return () => {
      active = false
    }
  }, [setOnlinePhoto])

  const user = data?.user ?? null
  const isGuest = !user || user.provider === "guest"

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      // deja deconnecte : on repart quand meme de l'accueil
    }
    router.replace("/")
  }

  const handleDelete = async () => {
    const question = isGuest
      ? "Effacer tes parties, ta musique et ton pseudo de Blindz ? C'est définitif."
      : "Supprimer définitivement ton compte ? Tes parties, ta musique et ta session seront effacées. C'est définitif."
    if (!window.confirm(question)) return
    setDeleting(true)
    try {
      await api.deleteAccount()
      try {
        localStorage.removeItem(NICKNAME_KEY)
      } catch {
        // stockage indisponible : rien a effacer
      }
      router.replace("/")
    } catch (err) {
      console.error("delete_account_failed", err)
      window.alert("La suppression n'a pas marché. Réessaie dans un instant.")
      setDeleting(false)
    }
  }

  if (!data || pseudo === null) {
    return <div className="grid min-h-screen place-items-center text-sm text-sourd">Chargement…</div>
  }

  return (
    <div className="min-h-screen text-ink">
      <main className="mx-auto w-full max-w-xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <Link
          href="/modes/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sourd transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        <h1 className="mt-6 font-display text-[2.4rem] font-semibold leading-none sm:text-5xl">
          Mon <em className="font-medium italic" style={{ color: accentTexte(CORAL) }}>compte</em>
        </h1>
        {data.stats && <p className="mt-3 font-mono text-[13px] text-ink-2">{data.stats}</p>}

        {/* T39 : la photo des joueurs Discord est leur avatar Discord, gere chez Discord. */}
        {user && user.provider !== "discord" && (
          <Block title="Photo">
            <div className="flex items-center gap-5">
              <PhotoPicker
                src={photo.src}
                busy={photo.busy}
                error={photo.error}
                onPick={file => {
                  void photo.pick(file, true)
                }}
                onRemove={() => {
                  void photo.remove()
                }}
              />
              <p className="text-sm text-ink-2">
                Elle s&apos;affiche à côté de ton pseudo pour les joueurs de ta salle.
              </p>
            </div>
          </Block>
        )}

        <Block title="Pseudo">
          <PseudoField initial={pseudo} />
        </Block>

        {user && isGuest && (
          <Block title="Garder mes infos">
            <KeepMyInfo pseudo={pseudo} onKept={kept => setData(prev => (prev ? { ...prev, user: kept } : prev))} />
          </Block>
        )}

        <Block title="Mes dernières parties">
          {data.games === null ? (
            <p className="text-sm text-sourd">Impossible de charger tes parties pour l&apos;instant.</p>
          ) : data.games.length === 0 ? (
            <p className="text-sm text-ink-2">
              Pas encore de partie ici.{" "}
              <Link href="/modes/" className="font-semibold text-ink underline underline-offset-4">
                Lancer une partie
              </Link>
            </p>
          ) : (
            <RecentGames games={data.games} />
          )}
        </Block>

        <Block title="Ma musique">
          {user ? (
            <MusicLibrary accent={CORAL} emptyText="Pas encore de musique enregistrée." />
          ) : (
            <p className="text-sm text-ink-2">Pas encore de musique enregistrée.</p>
          )}
          <Link
            href="/import/"
            className="mt-3 inline-block text-sm font-semibold text-ink underline decoration-[rgb(var(--c-ink)/.35)] underline-offset-4 hover:decoration-ink"
          >
            Ajouter une playlist
          </Link>
        </Block>

        <Block title="Apparence">
          <AppearanceChoice />
        </Block>

        <Block title="Mes données">
          <p className="text-sm text-ink-2">
            Ton pseudo, ta photo si tu en as mis une, ton lien de musique et l&apos;historique de tes parties. Rien d&apos;autre, aucun tracking publicitaire.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <FootLink href="/confidentialite/">Confidentialité</FootLink>
            <FootLink href="/conditions/">Conditions</FootLink>
            <FootLink href="/mentions-legales/">Mentions légales</FootLink>
            <FootLink href="/avis/">Donne ton avis</FootLink>
            <button
              type="button"
              onClick={() => openBugReport()}
              className="text-ink-2 underline decoration-[rgb(var(--c-ink)/.3)] underline-offset-4 transition hover:text-ink"
            >
              Signaler un bug
            </button>
          </p>

          {user && !isGuest && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dotted border-[rgb(var(--c-line)/.35)] pt-4 text-sm">
              <span className="text-ink-2">
                Connecté en tant que <strong className="text-ink">{user.username}</strong>
              </span>
              <button type="button" onClick={handleLogout} className="font-semibold text-ink underline underline-offset-4">
                Se déconnecter
              </button>
            </div>
          )}

          {user && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="mt-5 text-sm font-semibold text-rouge-txt underline decoration-[rgb(var(--c-rouge-txt)/.4)] underline-offset-4 hover:decoration-rouge-txt disabled:opacity-50"
            >
              {deleting ? "Suppression…" : isGuest ? "Effacer mes données" : "Supprimer mon compte"}
            </button>
          )}
        </Block>
      </main>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-terra-txt">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FootLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-ink-2 underline decoration-[rgb(var(--c-ink)/.3)] underline-offset-4 transition hover:text-ink">
      {children}
    </Link>
  )
}
