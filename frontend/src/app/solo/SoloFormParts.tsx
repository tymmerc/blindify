"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PROFILE_URL_KEY, readStored } from "@/lib/soloSetup"

// Briques communes aux trois onglets du lobby solo (classique, chrono, defi).

export const FIELD_LABEL = "text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]"

export function FormCard({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-7">
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-semibold text-[#2e2014]">{title}</h2>
        <p className="text-sm leading-relaxed text-[#6b573f]">{intro}</p>
      </div>
      {children}
    </section>
  )
}

export interface StoredLink {
  url: string
  setUrl: (value: string) => void
  /** Lien deja connu (ecran d'entree) : on affiche une confirmation plutot que le champ. */
  showInput: boolean
  provider: "Deezer" | "Spotify"
  startEditing: () => void
}

/** Lien de musique pre-rempli depuis /jouer, modifiable a la demande. */
export function useStoredLink(): StoredLink {
  const [url, setUrl] = useState("")
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const stored = readStored(PROFILE_URL_KEY)
    if (stored) setUrl(stored)
  }, [])
  const hasLink = url.trim().length > 0
  return {
    url,
    setUrl,
    showInput: editing || !hasLink,
    provider: /deezer/i.test(url) ? "Deezer" : "Spotify",
    startEditing: () => setEditing(true),
  }
}

export function MusicLinkField({ id, link }: { id: string; link: StoredLink }) {
  if (!link.showInput) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border-[1.5px] border-[#7d9471] bg-[#eef1e8] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#2e2014]">
          <span aria-hidden className="text-base text-[#5d7252]">✓</span> Ta musique : {link.provider}
        </span>
        <button type="button" onClick={link.startEditing} className="text-[12px] font-bold text-[#6b573f] underline underline-offset-2 hover:text-[#2e2014]">
          Changer
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={FIELD_LABEL}>
        Lien de playlist ou profil
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        value={link.url}
        onChange={e => link.setUrl(e.target.value)}
        placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
        className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
      />
    </div>
  )
}

export interface PickerOption {
  label: string
  value: number
}

/** Rangee de boutons a choix unique (nombre de titres, duree du chrono). */
export function OptionPicker({ label, options, value, onChange }: {
  label: string
  options: PickerOption[]
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex gap-2">
        {options.map(opt => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(opt.value)}
              className={`flex-1 rounded-md border-[1.5px] py-2.5 font-display text-sm font-semibold transition ${
                isActive
                  ? "border-[#2e2014] bg-[#c65133] text-[#f4ecdb] shadow-[2px_2px_0_#2e2014]"
                  : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] text-[#6b573f] hover:border-[#2e2014]"
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const ROUND_OPTIONS: PickerOption[] = [5, 10, 15, 20].map(n => ({ label: String(n), value: n }))
