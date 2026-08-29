"use client"

// Bibliotheque de liens : l'historique dedoublonne de tout ce que le joueur a
// importe. Les cases cochees decident de ce qui joue CE SOIR (la partie ne
// pioche que dans les cartes actives). Le detail d'une carte reste
// non-spoilant : stats + mosaique floutee ; les titres sont derriere un clic
// explicite, uniquement parce que ce sont les siens.

import { useCallback, useEffect, useState } from "react"
import { Music2, Trash2, ChevronRight, X } from "lucide-react"
import { api } from "@/lib/api"
import type { ImportedLink, LinkDetails } from "@/lib/types"

const DECADE_ORDER = [1960, 1970, 1980, 1990, 2000, 2010, 2020]

export function MusicLibrary({ accent, refreshSignal }: { accent: string; refreshSignal?: number }) {
  const [links, setLinks] = useState<ImportedLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<LinkDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showTracks, setShowTracks] = useState(false)

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

  const toggle = async (link: ImportedLink) => {
    // optimiste : la case repond tout de suite
    setLinks(prev => prev?.map(l => (l.id === link.id ? { ...l, active: !l.active } : l)) ?? null)
    try {
      await api.toggleLink(link.id, !link.active)
    } catch {
      setLinks(prev => prev?.map(l => (l.id === link.id ? { ...l, active: link.active } : l)) ?? null)
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
    return <p className="text-xs text-[#8a7558]">Chargement de ta musique…</p>
  }
  if (links.length === 0) {
    return <p className="text-xs text-[#8a7558]">Aucun lien importé pour l'instant : colle un lien ci-dessous.</p>
  }

  const activeCount = links.filter(l => l.active).reduce((a, l) => a + Number(l.track_count), 0)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">
        Ce soir : {activeCount} titre{activeCount > 1 ? "s" : ""} en jeu
      </p>
      {links.map(link => (
        <div
          key={link.id}
          className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-2.5 py-2 transition ${
            link.active ? "border-[#2e2014] bg-[#f4ecdb]" : "border-[rgba(46,32,20,.25)] bg-[#ece1c8] opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={link.active}
            onChange={() => toggle(link)}
            aria-label={`Jouer avec ${link.label ?? link.url}`}
            className="h-4 w-4 shrink-0 accent-[#c65133]"
          />
          {link.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md border-[1.5px] border-[#2e2014] object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-[1.5px] border-[#2e2014] bg-[#e0d4ba]">
              <Music2 className="h-4 w-4 text-[#6b573f]" />
            </span>
          )}
          <button type="button" onClick={() => openDetail(link)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-[#2e2014]">{link.label ?? link.url}</p>
            <p className="text-[11px] text-[#8a7558]">
              {link.track_count} titre{Number(link.track_count) > 1 ? "s" : ""}
              {link.times_played > 0 ? ` · joué ${link.times_played} fois` : " · jamais joué"}
            </p>
          </button>
          <button type="button" onClick={() => openDetail(link)} aria-label="Voir le détail" className="shrink-0 p-1 text-[#8a7558] hover:text-[#2e2014]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => remove(link)} aria-label="Supprimer" className="shrink-0 p-1 text-[#8a7558] hover:text-[#9c2f1d]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {error && <p className="text-xs font-semibold text-[#9c2f1d]">{error}</p>}

      {/* Detail : stats sans spoiler, mosaique floutee, titres derriere un clic */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#2e2014]/40 p-4 sm:items-center" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-5 shadow-[6px_6px_0_rgba(46,32,20,.3)]"
            onClick={e => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <p className="text-sm text-[#8a7558]">Chargement…</p>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="m-0 font-display text-xl font-semibold text-[#2e2014]">{detail.link.label ?? "Ce lien"}</h3>
                  <button type="button" onClick={() => setDetail(null)} aria-label="Fermer" className="shrink-0 p-1 text-[#8a7558] hover:text-[#2e2014]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { v: detail.stats.total, l: "titres" },
                    { v: detail.stats.playable, l: "jouables" },
                    { v: detail.stats.artists, l: "artistes" },
                  ].map(sItem => (
                    <div key={sItem.l} className="rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#ece1c8] px-2 py-2">
                      <p className="m-0 font-display text-xl font-bold text-[#2e2014]">{sItem.v}</p>
                      <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">{sItem.l}</p>
                    </div>
                  ))}
                </div>

                {detail.decades.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">Époques</p>
                    <div className="flex items-end gap-1.5" style={{ height: 56 }}>
                      {DECADE_ORDER.filter(d => detail.decades.some(x => Number(x.decade) === d)).map(d => {
                        const n = Number(detail.decades.find(x => Number(x.decade) === d)?.n ?? 0)
                        const max = Math.max(...detail.decades.map(x => Number(x.n)))
                        return (
                          <div key={d} className="flex flex-1 flex-col items-center gap-0.5">
                            <div className="w-full rounded-t-sm border border-[#2e2014]" style={{ height: `${Math.max(8, (n / max) * 44)}px`, background: accent }} />
                            <span className="text-[9px] font-bold text-[#8a7558]">{String(d).slice(2)}s</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {detail.covers.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7558]">L'ambiance (sans spoiler)</p>
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
                    <div className="max-h-48 overflow-y-auto rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#ece1c8] p-2">
                      {detail.tracks.map((t, i) => (
                        <p key={i} className="m-0 truncate py-0.5 text-xs text-[#4a3a26]">
                          <span className="font-semibold">{t.title}</span> · {t.artist}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTracks(true)}
                      className="text-xs font-semibold text-[#8a7558] underline decoration-dotted underline-offset-4 hover:text-[#2e2014]"
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
