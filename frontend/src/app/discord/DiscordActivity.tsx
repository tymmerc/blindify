"use client"

import { useEffect, useState, type ReactNode } from "react"
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
import {
  DiscordBootError,
  bootDiscordActivity,
  type ActivitySdk,
  type DiscordBootErrorCode,
  type DiscordBootResult,
  type DiscordBootStep,
} from "@/lib/discord/boot"
import { describeError, discordLog } from "@/lib/discord/log"
import { traceRpcMessages } from "@/lib/discord/rpcTrace"
import { useInstanceParticipants } from "@/lib/discord/useInstanceParticipants"
import { ModeLobbyView } from "@/app/multiplayer/ModeLobbyView"
import { DiscordMenu } from "./DiscordMenu"

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

type Status =
  | { kind: "boot"; step: DiscordBootStep }
  | { kind: "ready"; result: DiscordBootResult }
  | { kind: "deleted" }
  | { kind: "error"; code: DiscordBootErrorCode | "unexpected"; message: string }

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

// Un seul demarrage pour toute la page, hors de React : si l'arbre est
// regenere (erreur d'hydratation) ou le composant remonte, un second SDK
// enverrait une seconde poignee de main que Discord ignore, et attendrait un
// READY qui ne vient jamais. Chaque montage s'abonne a la meme promesse.
let pageBoot: Promise<DiscordBootResult> | null = null
// Le dernier montage affiche l'etape en cours ; un ancien, demonte, n'a plus d'ecran.
let lastStep: DiscordBootStep = "config"
let showStep: ((step: DiscordBootStep) => void) | null = null
let mounts = 0

/** Tests seulement : chaque test repart d'une page neuve. */
export function resetDiscordBootForTests(): void {
  pageBoot = null
  lastStep = "config"
  showStep = null
  mounts = 0
}

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
  const [status, setStatus] = useState<Status>(() => ({ kind: "boot", step: lastStep }))

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
    let active = true
    const show = (step: DiscordBootStep) => {
      if (active) setStatus({ kind: "boot", step })
    }
    showStep = show
    if (!pageBoot) {
      const stopTrace = traceRpcMessages(discordLog)
      const mappings = installUrlMappings(apiBaseUrl)
      audioManager.setSrcMapper(createPreviewSrcMapper(mappings))
      pageBoot = bootDiscordActivity({
        api,
        createSdk,
        instanceId: params.instanceId,
        setBearer: setApiBearerToken,
        log: discordLog,
        onStep: step => {
          lastStep = step
          showStep?.(step)
        },
      })
      pageBoot.finally(stopTrace).catch(() => {})
    }
    pageBoot
      .then(result => {
        if (!active) return
        configureSocket(socketSettings(window.location.origin, result.sessionToken))
        setStatus({ kind: "ready", result })
      })
      .catch((err: unknown) => {
        if (!active) return
        discordLog("demarrage en echec", err instanceof DiscordBootError ? { code: err.code, cause: describeError(err.cause) } : describeError(err))
        if (err instanceof DiscordBootError) {
          setStatus({ kind: "error", code: err.code, message: err.message })
        } else {
          console.error("discord_boot_failed", err)
          setStatus({ kind: "error", code: "unexpected", message: "Un imprévu a coupé le démarrage. Réessaie." })
        }
      })
    return () => {
      active = false
      if (showStep === show) showStep = null
    }
  }, [params, createSdk, apiBaseUrl])

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

  if (status.kind === "error") {
    return (
      <Shell title={ERROR_TITLE[status.code]}>
        <p className="m-0 text-sm font-semibold text-[#9c2f1d]">{status.message}</p>
        {status.code !== "disabled" ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
          >
            Réessayer
          </button>
        ) : null}
      </Shell>
    )
  }

  if (status.kind === "deleted") {
    return (
      <Shell title="Compte supprimé">
        <p className="m-0 text-sm text-[#6b573f]">
          Ton compte et tes données sont effacés. Si tu relances l&apos;Activité, Blindz te recrée un compte neuf à partir de
          ton pseudo Discord.
        </p>
      </Shell>
    )
  }

  if (status.kind === "boot") {
    return (
      <Shell title="Blindz dans ton salon">
        <div className="flex items-center gap-3 text-sm text-[#6b573f]">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: ACCENT }} aria-hidden />
          <p className="m-0" role="status">{STEP_COPY[status.step]}</p>
        </div>
      </Shell>
    )
  }

  const { result } = status
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-4 pt-4 sm:px-6">
        <VoiceStrip sdk={result.sdk} />
        <DiscordMenu onDeleted={() => setStatus({ kind: "deleted" })} />
      </div>
      <ModeLobbyView
        mode="friends"
        modeConfig={GAME_MODES.friends}
        intent={null}
        initialJoinCode={result.room.room_code}
        autojoin={null}
        initialNickname={result.user.username ?? undefined}
        surface="discord"
        // Quitter ou revenir : on recharge, le salon nous remet dans sa salle.
        onLeave={() => window.location.reload()}
      />
    </div>
  )
}

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
