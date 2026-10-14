"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { DiscordSDK } from "@discord/embedded-app-sdk"
import { Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { setApiBearerToken } from "@/lib/apiClient"
import { API_BASE_URL } from "@/lib/config"
import { configureSocket } from "@/lib/socket"
import { audioManager } from "@/lib/audioManager"
import { GAME_MODES } from "@/lib/gameModes"
import { readActivityParams, type ActivityParams } from "@/lib/discord/activityParams"
import { BLINDZ_MAPPING_PREFIX, createPreviewSrcMapper, installUrlMappings } from "@/lib/discord/urlMappings"
import type { ActivitySdk, DiscordBootErrorCode, DiscordBootStep } from "@/lib/discord/boot"
import { createActivityStore, type ActivityState, type ActivityStore } from "@/lib/discord/activityStore"
import { setExternalLinkOpener } from "@/lib/externalLink"
import { describeError, discordLog } from "@/lib/discord/log"
import { traceRpcMessages } from "@/lib/discord/rpcTrace"
import { useInstanceParticipants } from "@/lib/discord/useInstanceParticipants"
import { ModeLobbyView } from "@/app/multiplayer/ModeLobbyView"
import { DiscordMenu } from "./DiscordMenu"
import { DiscordMusicStep } from "./DiscordMusicStep"

/**
 * Blindz dans un salon vocal Discord. La page est chargee par le proxy de
 * Discord dans une iframe ; le salon est la salle (un instanceId du SDK egale
 * une salle Blindz, cote serveur). Une fois la session ouverte, c'est le lobby
 * et l'ecran de jeu habituels, en variante "discord" : pas de code a partager,
 * les potes du salon arrivent tout seuls.
 *
 * Trois reglages avant tout : les requetes passent par le proxy (URL mappings),
 * les extraits aussi (audioManager), et la session voyage en Bearer plutot
 * qu'en cookie, API comme socket.
 */
type Props = {
  /** Pour les tests : la partie "?..." de l'adresse ; par defaut celle de la page. */
  search?: string
  createSdk?: (clientId: string) => ActivitySdk
  apiBaseUrl?: string
}

// A distance : terracotta, comme le mode entre amis dont la salle herite.
const ACCENT = "#c65133"

const STEP_COPY: Record<DiscordBootStep, string> = {
  config: "On prépare la salle…",
  sdk: "Connexion à Discord…",
  authorize: "Discord te demande ton accord…",
  session: "On ouvre ta session…",
  authenticate: "Dernier réglage avec Discord…",
  room: "On rejoint la salle du salon…",
}

const ERROR_TITLE: Record<DiscordBootErrorCode | "unexpected", string> = {
  disabled: "Pas encore ouvert",
  authorize_refused: "Il manque ton accord",
  session_failed: "Connexion impossible",
  discord_unavailable: "Discord ne répond pas",
  authenticate_failed: "Discord n'a pas suivi",
  room_failed: "La salle n'a pas voulu",
  unexpected: "Ça n'a pas marché",
}

const defaultCreateSdk = (clientId: string): ActivitySdk => new DiscordSDK(clientId)

// Un seul parcours pour toute la page, hors de React (lib/discord/activityStore) :
// un composant remonte ou un arbre regenere reprend le meme, sans second SDK
// ni rechargement. Discord ne repond pas a une seconde poignee de main.
let pageStore: ActivityStore | null = null
let mounts = 0

/** Tests seulement : chaque test repart d'une page neuve. */
export function resetDiscordActivityForTests(): void {
  pageStore = null
  mounts = 0
  setExternalLinkOpener(null)
}

const BOOT: ActivityState = { kind: "boot", step: "config" }
const noSubscribe = () => () => {}

function referrerOrigin(): string | null {
  try {
    return document.referrer ? new URL(document.referrer).origin : null
  } catch {
    return null
  }
}

/**
 * Le socket vise directement le proxy : l'origine de la page et le chemin de
 * la correspondance /blindz (qui retire le chemin de base de l'API), avec la
 * session dans le handshake. Pas de reecriture a l'execution pour lui : le
 * client socket.io capture window.WebSocket au chargement du module, avant
 * que le SDK ne l'ait remplace (vu sur la pile le 10/10/2026 : websocket parti
 * hors du proxy, polling seulement).
 */
export function socketSettings(pageOrigin: string, token: string): { origin: string; path: string; auth: { token: string } } {
  return { origin: pageOrigin, path: `${BLINDZ_MAPPING_PREFIX}/socket.io`, auth: { token } }
}

export function DiscordActivity({ search, createSdk = defaultCreateSdk, apiBaseUrl = API_BASE_URL }: Props) {
  // La page est pre-rendue a l'export sans adresse : les parametres de Discord
  // se lisent apres le montage, sinon le HTML du serveur (« hors Discord ») et
  // le premier rendu du client different (erreur d'hydratation React 418, vue
  // sur la pile le 10/10/2026). undefined = pas encore lu.
  const [params, setParams] = useState<ActivityParams | null | undefined>(undefined)
  useEffect(() => {
    setParams(readActivityParams(search ?? window.location.search))
  }, [search])
  const [store, setStore] = useState<ActivityStore | null>(() => pageStore)
  // « Ta musique » rouvert depuis le lobby, par-dessus : le lobby reste monte, on ne quitte pas la salle.
  const [editingMusic, setEditingMusic] = useState(false)
  // « Reessayer » du lobby : on le remonte, au lieu de recharger l'iframe.
  const [lobbyKey, setLobbyKey] = useState(0)

  useEffect(() => {
    if (params === undefined) return
    mounts += 1
    discordLog("montage", {
      n: mounts,
      dansDiscord: Boolean(params),
      chemin: window.location.pathname,
      origine: window.location.origin,
      referrer: referrerOrigin(),
      iframe: window.parent !== window,
    })
  }, [params])

  useEffect(() => {
    if (!params) return
    if (!pageStore) {
      const stopTrace = traceRpcMessages(discordLog)
      const created = createActivityStore({
        api,
        createSdk,
        setBearer: setApiBearerToken,
        installMappings: () => {
          const mappings = installUrlMappings(apiBaseUrl)
          audioManager.setSrcMapper(createPreviewSrcMapper(mappings))
        },
        onSession: session => {
          configureSocket(socketSettings(window.location.origin, session.sessionToken))
          setExternalLinkOpener(url => {
            session.sdk.commands.openExternalLink({ url }).catch((err: unknown) => discordLog("lien externe refuse", describeError(err)))
          })
        },
        instanceId: params.instanceId,
        log: discordLog,
      })
      created.subscribe(() => {
        if (created.getState().kind !== "boot") stopTrace()
      })
      pageStore = created
      created.start()
    }
    setStore(pageStore)
  }, [params, createSdk, apiBaseUrl])

  const state = useSyncExternalStore(store?.subscribe ?? noSubscribe, () => store?.getState() ?? BOOT, () => BOOT)

  if (params === undefined) {
    return (
      <Shell title="Blindz dans ton salon">
        <div className="flex items-center gap-3 text-sm text-[#6b573f]">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: ACCENT }} aria-hidden />
          <p className="m-0">Un instant…</p>
        </div>
      </Shell>
    )
  }

  if (params === null) {
    return (
      <Shell title="Cette page se lance depuis Discord">
        <p className="m-0 text-sm text-[#6b573f]">
          Ouvre un salon vocal, clique sur la fusée (Activités) et choisis Blindz. Pour jouer dans le navigateur,
          c&apos;est sur blindz.app.
        </p>
      </Shell>
    )
  }

  if (state.kind === "error") {
    return (
      <Shell title={ERROR_TITLE[state.code]}>
        <p className="m-0 text-sm font-semibold text-[#9c2f1d]">{state.message}</p>
        {state.action === "retry" ? (
          <button type="button" onClick={() => store?.retry()} className={PRIMARY}>
            Réessayer
          </button>
        ) : null}
        {state.action === "relaunch" ? (
          <button type="button" onClick={() => store?.close()} className={PRIMARY}>
            Fermer l&apos;Activité
          </button>
        ) : null}
      </Shell>
    )
  }

  if (state.kind === "deleted") {
    return (
      <Shell title="Compte supprimé">
        <p className="m-0 text-sm text-[#6b573f]">
          Ton compte et tes données sont effacés. Si tu relances l&apos;Activité, Blindz te recrée un compte neuf à partir de
          ton pseudo Discord.
        </p>
      </Shell>
    )
  }

  if (state.kind === "boot") {
    return (
      <Shell title="Blindz dans ton salon">
        <div className="flex items-center gap-3 text-sm text-[#6b573f]">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: ACCENT }} aria-hidden />
          <p className="m-0" role="status">{STEP_COPY[state.step]}</p>
        </div>
      </Shell>
    )
  }

  const topBar = (
    <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-4 pt-4 sm:px-6">
      <VoiceStrip sdk={state.session.sdk} />
      <DiscordMenu onDeleted={() => store?.markDeleted()} />
    </div>
  )

  if (state.kind === "music") {
    return (
      <div className="min-h-screen">
        {topBar}
        <DiscordMusicStep mode="launch" onContinue={() => store?.enter()} entering={state.entering} error={state.error} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {topBar}
      <ModeLobbyView
        key={lobbyKey}
        mode="friends"
        modeConfig={GAME_MODES.friends}
        intent={null}
        initialJoinCode={state.room.room_code}
        autojoin={null}
        initialNickname={state.session.user.username ?? undefined}
        surface="discord"
        // Quitter : retour a « Ta musique », sans recharger (Discord couperait la session).
        onLeave={() => {
          setEditingMusic(false)
          store?.leave()
        }}
        onEditMusic={() => setEditingMusic(true)}
        onRetry={() => setLobbyKey(k => k + 1)}
      />
      {editingMusic ? (
        <div role="dialog" aria-modal="true" aria-label="Ta musique" className="fixed inset-0 z-50 overflow-y-auto bg-[#f4ecdb]">
          <DiscordMusicStep mode="edit" onContinue={() => setEditingMusic(false)} />
        </div>
      ) : null}
    </div>
  )
}

const PRIMARY =
  "mt-4 w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"

/** Ecran d'attente ou d'erreur, Club analogique : une carte sur le papier. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-8 text-[#2e2014]">
      <section className="w-full max-w-md rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <p className="m-0 mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[#2e2014]" style={{ background: ACCENT }} />
          Activité Discord
        </p>
        <h1 className="m-0 mb-4 font-display text-2xl font-semibold leading-tight">{title}</h1>
        {children}
      </section>
    </main>
  )
}

/** Qui est dans le salon vocal, d'apres Discord : ceux qui peuvent encore entrer. */
function VoiceStrip({ sdk }: { sdk: ActivitySdk }) {
  const participants = useInstanceParticipants(sdk)
  if (participants.length === 0) return <span />
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-[#6b573f]" data-testid="salon-vocal">
      <span className="font-bold uppercase tracking-[0.18em]">Dans le salon vocal</span>
      {participants.map(p => (
        <span key={p.id} className="rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-2.5 py-0.5 font-semibold text-[#2e2014]">
          {p.name}
        </span>
      ))}
    </div>
  )
}
