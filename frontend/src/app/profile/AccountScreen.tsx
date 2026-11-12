"use client"

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

  useEffect(() => {
    let active = true
    async function load() {
      const me = await api.checkAuth().catch(() => null)
      const user = me?.user ?? null
      if (!active) return
      setPseudo(initialPseudo(readStored(NICKNAME_KEY), user?.username))
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
  }, [])

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
    return <div className="grid min-h-screen place-items-center text-sm text-[#8a7558]">Chargement…</div>
  }

  return (
    <div className="min-h-screen text-[#2e2014]">
      <main className="mx-auto w-full max-w-xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <Link
          href="/modes/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8a7558] transition hover:text-[#2e2014]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        <h1 className="mt-6 font-display text-[2.4rem] font-semibold leading-none sm:text-5xl">
          Mon <em className="font-medium italic" style={{ color: CORAL }}>compte</em>
        </h1>
        {data.stats && <p className="mt-3 font-mono text-[13px] text-[#6b573f]">{data.stats}</p>}

        <Block title="Pseudo">
          <PseudoField initial={pseudo} />
        </Block>

        <Block title="Mes dernières parties">
          {data.games === null ? (
            <p className="text-sm text-[#8a7558]">Impossible de charger tes parties pour l&apos;instant.</p>
          ) : data.games.length === 0 ? (
            <p className="text-sm text-[#6b573f]">
              Pas encore de partie ici.{" "}
              <Link href="/modes/" className="font-semibold text-[#2e2014] underline underline-offset-4">
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
            <p className="text-sm text-[#6b573f]">Pas encore de musique enregistrée.</p>
          )}
          <Link
            href="/import/"
            className="mt-3 inline-block text-sm font-semibold text-[#2e2014] underline decoration-[rgba(46,32,20,.35)] underline-offset-4 hover:decoration-[#2e2014]"
          >
            Ajouter une playlist
          </Link>
        </Block>

        <Block title="Mes données">
          <p className="text-sm text-[#6b573f]">
            Ton pseudo, ton lien de musique et l&apos;historique de tes parties. Rien d&apos;autre, aucun tracking publicitaire.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <FootLink href="/confidentialite/">Confidentialité</FootLink>
            <FootLink href="/conditions/">Conditions</FootLink>
            <FootLink href="/mentions-legales/">Mentions légales</FootLink>
            <FootLink href="/avis/">Donne ton avis</FootLink>
            <button
              type="button"
              onClick={() => openBugReport()}
              className="text-[#6b573f] underline decoration-[rgba(46,32,20,.3)] underline-offset-4 transition hover:text-[#2e2014]"
            >
              Signaler un bug
            </button>
          </p>

          {user && !isGuest && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dotted border-[rgba(46,32,20,.35)] pt-4 text-sm">
              <span className="text-[#6b573f]">
                Connecté en tant que <strong className="text-[#2e2014]">{user.username}</strong>
              </span>
              <button type="button" onClick={handleLogout} className="font-semibold text-[#2e2014] underline underline-offset-4">
                Se déconnecter
              </button>
            </div>
          )}

          {user && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="mt-5 text-sm font-semibold text-[#9c2f1d] underline decoration-[rgba(156,47,29,.4)] underline-offset-4 hover:decoration-[#9c2f1d] disabled:opacity-50"
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
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: CORAL }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function FootLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[#6b573f] underline decoration-[rgba(46,32,20,.3)] underline-offset-4 transition hover:text-[#2e2014]">
      {children}
    </Link>
  )
}
