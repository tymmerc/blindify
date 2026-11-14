"use client"

// Bibliotheque de liens : l'historique dedoublonne de tout ce que le joueur a
// importe. Une seule carte choisie par joueur (T37, decision de Tym du 13/11) :
// c'est elle qui joue CE SOIR, la partie ne pioche que dedans. Le detail d'une carte reste
// non-spoilant : stats + mosaique floutee ; les titres sont derriere un clic
// explicite, uniquement parce que ce sont les siens.

import { useCallback, useEffect, useId, useState } from "react"
import { Music2, Trash2, ChevronRight, X } from "lucide-react"
import { api } from "@/lib/api"
import type { ImportedLink, LinkDetails } from "@/lib/types"

const DECADE_ORDER = [1960, 1970, 1980, 1990, 2000, 2010, 2020]

type MusicLibraryProps = {
  accent: string
  refreshSignal?: number
  /** La bibliotheque chargee ou modifiee (l'ecran « Ta musique » de l'Activite dit s'il y a de quoi jouer). */
  onLinksChange?: (links: ImportedLink[]) => void
  /** Texte d'une bibliotheque vide (le champ d'import n'est pas toujours en dessous). */
  emptyText?: string
}

export function MusicLibrary({ accent, refreshSignal, onLinksChange, emptyText = "Aucun lien importé pour l'instant : colle un lien ci-dessous." }: MusicLibraryProps) {
  const [links, setLinks] = useState<ImportedLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<LinkDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showTracks, setShowTracks] = useState(false)
  const radioGroup = useId()

  const load = useCallback(async () => {
    try {
      const { links: rows } = await api.getLinks()
      setLinks(rows)
      setError(null)
    } catch (err) {
      console.error("links_load_failed", err)
      setError("Bibliothèque indisponible pour l'instant.")
    }
  }, [])

  useEffect(() => { void load() }, [load, refreshSignal])

  useEffect(() => {
    if (links) onLinksChange?.(links)
  }, [links, onLinksChange])

  const choose = async (link: ImportedLink) => {
    if (link.active) return
    const before = links
    // optimiste : le choix repond tout de suite, les autres cartes se decochent
    setLinks(prev => prev?.map(l => ({ ...l, active: l.id === link.id })) ?? null)
    try {
      await api.toggleLink(link.id, true)
    } catch {
      setLinks(before)
    }
  }

  const remove = async (link: ImportedLink) => {
    if (!window.confirm(`Supprimer « ${link.label ?? "ce lien"} » et ses ${link.track_count} titres de ta bibliothèque ?`)) return
    try {
      await api.deleteLink(link.id)
      setLinks(prev => prev?.filter(l => l.id !== link.id) ?? null)
    } catch {
      setError("Suppression impossible, réessaie.")
    }
  }

  const openDetail = async (link: ImportedLink) => {
    setDetailLoading(true)
    setShowTracks(false)
    try {
      setDetail(await api.linkDetails(link.id))
    } catch {
      setError("Détail indisponible.")
    } finally {
      setDetailLoading(false)
    }
  }

  if (links === null) {
    return <p className="text-xs text-sourd">Chargement de ta musique…</p>
  }
  if (links.length === 0) {
    return <p className="text-xs text-sourd">{emptyText}</p>
  }

  const activeCount = links.filter(l => l.active).reduce((a, l) => a + Number(l.track_count), 0)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sourd">
        Ce soir : {activeCount} titre{activeCount > 1 ? "s" : ""} en jeu
      </p>
      {links.map(link => (
        <div
          key={link.id}
          className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-2.5 py-2 transition ${
            link.active ? "border-line bg-paper" : "border-[rgb(var(--c-line)/.25)] bg-paper-deep opacity-60"
          }`}
        >
          <input
            type="radio"
            name={radioGroup}
            checked={link.active}
            onChange={() => choose(link)}
            aria-label={`Jouer avec ${link.label ?? link.url}`}
            className="h-4 w-4 shrink-0 accent-terra-txt"
          />
          {link.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md border-[1.5px] border-line object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-[1.5px] border-line bg-paper-strong">
              <Music2 className="h-4 w-4 text-ink-2" />
            </span>
          )}
          <button type="button" onClick={() => openDetail(link)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-ink">{link.label ?? link.url}</p>
            <p className="text-[11px] text-sourd">
              {link.track_count} titre{Number(link.track_count) > 1 ? "s" : ""}
              {link.times_played > 0 ? ` · joué ${link.times_played} fois` : " · jamais joué"}
            </p>
          </button>
          <button type="button" onClick={() => openDetail(link)} aria-label="Voir le détail" className="shrink-0 p-1 text-sourd hover:text-ink">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => remove(link)} aria-label="Supprimer" className="shrink-0 p-1 text-sourd hover:text-rouge-txt">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {error && <p className="text-xs font-semibold text-rouge-txt">{error}</p>}

      {/* Detail : stats sans spoiler, mosaique floutee, titres derriere un clic */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim/40 p-4 sm:items-center" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-md border-2 border-line bg-paper p-5 shadow-[6px_6px_0_rgb(var(--c-shadow)/.3)]"
            onClick={e => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <p className="text-sm text-sourd">Chargement…</p>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="m-0 font-display text-xl font-semibold text-ink">{detail.link.label ?? "Ce lien"}</h3>
                  <button type="button" onClick={() => setDetail(null)} aria-label="Fermer" className="shrink-0 p-1 text-sourd hover:text-ink">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { v: detail.stats.total, l: "titres" },
                    { v: detail.stats.playable, l: "jouables" },
                    { v: detail.stats.artists, l: "artistes" },
                  ].map(sItem => (
                    <div key={sItem.l} className="rounded-md border-[1.5px] border-[rgb(var(--c-line)/.25)] bg-paper-deep px-2 py-2">
                      <p className="m-0 font-display text-xl font-bold text-ink">{sItem.v}</p>
                      <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-sourd">{sItem.l}</p>
                    </div>
                  ))}
                </div>

                {detail.decades.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sourd">Époques</p>
                    <div className="flex items-end gap-1.5" style={{ height: 56 }}>
                      {DECADE_ORDER.filter(d => detail.decades.some(x => Number(x.decade) === d)).map(d => {
                        const n = Number(detail.decades.find(x => Number(x.decade) === d)?.n ?? 0)
                        const max = Math.max(...detail.decades.map(x => Number(x.n)))
                        return (
                          <div key={d} className="flex flex-1 flex-col items-center gap-0.5">
                            <div className="w-full rounded-t-sm border border-line" style={{ height: `${Math.max(8, (n / max) * 44)}px`, background: accent }} />
                            <span className="text-[9px] font-bold text-sourd">{String(d).slice(2)}s</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {detail.covers.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sourd">L'ambiance (sans spoiler)</p>
                    <div className="grid grid-cols-6 gap-1 overflow-hidden rounded-md">
                      {detail.covers.map((c, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={c} alt="" className="aspect-square w-full object-cover" style={{ filter: "blur(7px) saturate(1.1)" }} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  {showTracks ? (
                    <div className="max-h-48 overflow-y-auto rounded-md border-[1.5px] border-[rgb(var(--c-line)/.25)] bg-paper-deep p-2">
                      {detail.tracks.map((t, i) => (
                        <p key={i} className="m-0 truncate py-0.5 text-xs text-[#4a3a26] dark:text-ink-2">
                          <span className="font-semibold">{t.title}</span> · {t.artist}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTracks(true)}
                      className="text-xs font-semibold text-sourd underline decoration-dotted underline-offset-4 hover:text-ink"
                    >
                      Voir les titres (c'est ta playlist, à toi de voir si tu veux te spoiler)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
