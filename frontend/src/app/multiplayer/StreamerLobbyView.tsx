"use client"

/**
 * Lobby du mode streamer (T5). Mise en place en deux minutes : l'overlay dans
 * OBS (lien a copier), la musique hors de la VOD, le code au chat. Puis le
 * format, les manches, et le lancement.
 */
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Check, Copy, Radio } from "lucide-react"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/apiClient"
import { cleanTwitchChannel, liveLabel } from "@/lib/streamerLive"
import type { StreamerSubMode } from "@/lib/types"
import type { LobbyRendererProps } from "./lobbyTypes"
import { BLOCK, Label, LaunchButton, Panel, RoomCode, RoundSettings } from "./lobbyKit"

const ACCENT = "#7d9471"

export const STREAMER_FORMATS: ReadonlyArray<{ value: StreamerSubMode; title: string; desc: string }> = [
  { value: "viewers_only", title: "Ton chat devine", desc: "Toi, tu animes. Ton public répond sur son téléphone." },
  { value: "duo", title: "Ton chat, puis toi", desc: "Le public répond d'abord, puis tu tentes ta chance. Qui gagne la manche ?" },
  { value: "solo", title: "Toi tout seul", desc: "Tu devines, ton public regarde et commente." },
]

type OverlayLink = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string }

function useOverlayLink(code: string | null, isHost: boolean): OverlayLink {
  const [link, setLink] = useState<OverlayLink>({ status: "loading" })
  useEffect(() => {
    if (!code || !isHost) return
    let active = true
    api.streamerOverlay(code)
      .then(r => { if (active) setLink({ status: "ready", url: r.url }) })
      .catch((err: unknown) => {
        if (!active) return
        const message = err instanceof ApiError && err.message ? err.message : "Impossible de créer le lien d'overlay. Recharge la page."
        setLink({ status: "error", message })
      })
    return () => { active = false }
  }, [code, isHost])
  return link
}

function CopyOverlay({ link }: { link: OverlayLink }) {
  const [copied, setCopied] = useState<"ok" | "ko" | null>(null)
  // Le lobby passe souvent a l'ecran du live : le lien (qui donne l'extrait)
  // n'apparait en clair que si le streamer le demande.
  const [shown, setShown] = useState(false)
  if (link.status === "loading") return <p className="m-0 text-sm text-[#6b573f]">Préparation du lien…</p>
  if (link.status === "error") return <p role="alert" className="m-0 text-sm font-semibold text-[#9c2f1d]">{link.message}</p>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied("ok")
    } catch {
      setCopied("ko")
    }
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={copy}
        data-testid="copy-overlay"
        className={`flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_#2e2014] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#2e2014] ${copied === "ok" ? "bg-[#7d9471]" : "bg-[#f4ecdb]"}`}
      >
        {copied === "ok" ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
        {copied === "ok" ? "Lien copié" : "Copier le lien de l'overlay"}
      </button>
      {copied === "ko" && !shown ? (
        <p className="m-0 text-xs text-[#9c2f1d]">
          La copie automatique est bloquée.{" "}
          <button type="button" onClick={() => setShown(true)} className="font-semibold underline">Afficher le lien</button> (hors de l&apos;écran du live)
        </p>
      ) : null}
      {shown ? (
        <input readOnly value={link.url} aria-label="Lien de l'overlay" onFocus={e => e.currentTarget.select()} className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-2 py-1.5 text-xs" />
      ) : null}
      <p className="m-0 text-xs text-[#8a7558]">Ce lien joue la musique : garde-le pour toi, ne le colle pas dans le chat.</p>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#7d9471] font-display text-sm font-bold">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="m-0 font-semibold">{title}</p>
        {children}
      </div>
    </li>
  )
}

function SetupSteps({ code, link }: { code: string; link: OverlayLink }) {
  return (
    <Panel label="Mise en place · 2 minutes" dot={ACCENT} testId="streamer-setup">
      <ol className="m-0 flex list-none flex-col gap-5 p-0 text-sm text-[#2e2014]">
        <Step n={1} title="Ajoute l'overlay dans OBS">
          <p className="m-0 text-[#6b573f]">Sources, +, Navigateur. Colle le lien, largeur 1920, hauteur 1080. Le fond est transparent.</p>
          <CopyOverlay link={link} />
        </Step>
        <Step n={2} title="Garde la musique hors de ta VOD">
          <p className="m-0 text-[#6b573f]">
            Dans la source, coche « Contrôler l&apos;audio via OBS », puis mets-la sur une piste que ta VOD n&apos;enregistre pas.{" "}
            <Link href="/streamer/#obs" target="_blank" className="font-semibold text-[#2e2014] underline underline-offset-2">Le guide en une minute</Link>
          </p>
        </Step>
        <Step n={3} title="Donne le code à ton chat">
          <p className="m-0 text-[#6b573f]">
            Ils vont sur <b className="text-[#2e2014]">{liveLabel()}</b> et tapent <b className="text-[#2e2014]">{code}</b>. Le QR code est déjà sur l&apos;overlay.
          </p>
        </Step>
      </ol>
    </Panel>
  )
}

function FormatPicker({ value, onPick }: { value: StreamerSubMode; onPick: (v: StreamerSubMode) => void }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Format de la partie">
      {STREAMER_FORMATS.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onPick(opt.value)}
          className={`rounded-md border-2 px-3 py-2.5 text-left transition ${value === opt.value ? "border-[#2e2014] bg-[#7d9471] shadow-[3px_3px_0_#2e2014]" : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] hover:border-[#2e2014]"}`}
        >
          <span className="block text-sm font-bold">{opt.title}</span>
          <span className="block text-xs opacity-80">{opt.desc}</span>
        </button>
      ))}
    </div>
  )
}

/** Toute la musique de la partie vient du streamer : sa bibliotheque, et l'import sur place. */
function StreamerMusic() {
  const [refresh, setRefresh] = useState(0)
  return (
    <Panel label="Ta musique" dot={ACCENT} testId="lobby-musique" className="min-w-0">
      <p className="-mt-2 mb-3 text-sm text-[#6b573f]">Les morceaux de la partie viennent de tes playlists. Ton public n&apos;importe rien.</p>
      <div className="lg:max-h-[240px] lg:overflow-y-auto lg:pr-1">
        <MusicLibrary accent={ACCENT} refreshSignal={refresh} />
      </div>
      <div className="mt-4 border-t-2 border-dotted border-[rgba(46,32,20,.35)] pt-4">
        <ProfileImportBlock accent={ACCENT} hideHeader onImported={() => setRefresh(r => r + 1)} />
      </div>
    </Panel>
  )
}

/** Chat Twitch (T5b), facultatif : le nom de la chaine dont on lit le chat. */
function TwitchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cleaned = cleanTwitchChannel(value)
  return (
    <div>
      <label htmlFor="twitch-channel" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b573f]">
        Ta chaîne Twitch (facultatif)
      </label>
      <input
        id="twitch-channel"
        value={value}
        onChange={e => onChange(e.target.value.slice(0, 60))}
        placeholder="ta_chaine"
        autoComplete="off"
        className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-3 py-2.5 text-sm outline-none placeholder:text-[#b3a182] focus:border-[#7d9471]"
      />
      {cleaned === null ? (
        <p role="alert" className="m-0 mt-1 text-xs font-semibold text-[#9c2f1d]">Le nom d&apos;une chaîne fait 3 à 25 caractères : lettres, chiffres ou _.</p>
      ) : cleaned ? (
        <p className="m-0 mt-1 text-xs text-[#6b573f]">
          Ton chat pourra aussi répondre avec <b className="text-[#2e2014]">!b titre - artiste</b>. Moitié moins de points que sur la page, et
          ça baisse vite après la première bonne réponse, visible par tous.
        </p>
      ) : (
        <p className="m-0 mt-1 text-xs text-[#8a7558]">Sans chaîne, ton public répond seulement sur {liveLabel()}.</p>
      )}
    </div>
  )
}

function StreamerLobby(props: LobbyRendererProps) {
  const code = (props.room?.room_code ?? props.joinCode ?? "").toUpperCase()
  const link = useOverlayLink(code || null, props.isHost)
  const viewers = props.streamer?.viewerCount ?? 0
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <div className="space-y-5">
        <section className={`${BLOCK} p-5 text-[#2e2014] sm:p-7`} style={{ background: ACCENT }} data-testid="lobby-salle">
          <Label dot="#f4ecdb">Code à afficher sur le live</Label>
          <div className="my-5">
            <RoomCode code={code} size="xl" />
          </div>
          <p className="m-0 flex items-center gap-2 border-t-2 border-dashed border-[#2e2014]/40 pt-4 text-sm font-bold" data-testid="streamer-viewers">
            <Radio aria-hidden className="h-4 w-4" />
            {viewers === 0 ? "Personne sur la page pour l'instant" : `${viewers} viewer${viewers > 1 ? "s" : ""} prêt${viewers > 1 ? "s" : ""}`}
          </p>
        </section>
        {props.isHost ? <SetupSteps code={code} link={link} /> : null}
      </div>
      {props.isHost ? (
        <div className="space-y-5">
        <Panel label="La partie" dot={ACCENT}>
          <div className="space-y-4">
            <FormatPicker value={props.streamer?.subMode ?? "viewers_only"} onPick={v => props.streamer?.setSubMode(v)} />
            {props.streamer?.subMode !== "solo" ? (
              <TwitchField value={props.streamer?.twitchChannel ?? ""} onChange={v => props.streamer?.setTwitchChannel(v)} />
            ) : null}
            <RoundSettings room={props.room} accent={ACCENT} accentText="#2e2014" />
            <LaunchButton
              onStart={props.onStart}
              canStart={props.canStart && cleanTwitchChannel(props.streamer?.twitchChannel ?? "") !== null}
              starting={props.starting}
              importing={props.importing}
              hint={viewers === 0 ? "Tu peux lancer sans attendre : le chat peut arriver en cours de partie." : null}
            />
          </div>
        </Panel>
        <StreamerMusic />
        </div>
      ) : (
        <Panel label="Tu es viewer ?" dot={ACCENT}>
          <p className="m-0 text-sm text-[#6b573f]">
            Les viewers jouent sur <Link href={`/live/?code=${code}`} className="font-semibold text-[#2e2014] underline">{liveLabel()}</Link>, avec le code du stream.
          </p>
        </Panel>
      )}
    </div>
  )
}

function StreamerEntry({ onHost }: { onHost: () => void }) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Panel label="Streamer" dot={ACCENT}>
        <h2 className="mb-2 font-display text-3xl font-semibold leading-tight">Ouvre ta salle de live</h2>
        <p className="mb-5 text-sm text-[#6b573f]">Tu récupères un overlay pour OBS et un code pour ton chat. Ton public répond depuis son téléphone.</p>
        <button
          type="button"
          onClick={onHost}
          className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
        >
          Ouvrir la salle streamer
        </button>
      </Panel>
      <Panel label="Tu regardes un live ?" dot={ACCENT}>
        <p className="mb-3 text-sm text-[#6b573f]">Les viewers ne passent pas par ici : ils vont sur {liveLabel()} avec le code du stream.</p>
        <Link href="/live/" className="block w-full rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-4 py-3 text-center text-sm font-bold text-[#f4ecdb]">
          Jouer pendant un live
        </Link>
      </Panel>
    </div>
  )
}

export function StreamerLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") return <StreamerEntry onHost={() => props.onHost()} />
  if ((props.view === "hosting" || props.view === "waiting") && props.room) return <StreamerLobby {...props} />
  return null
}
