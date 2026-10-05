"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { buildSoloGamePath } from "@/lib/soloSetup"
import { FormCard, MusicLinkField, OptionPicker, ROUND_OPTIONS, useStoredLink } from "./SoloFormParts"

export function ClassicForm({ onChallenge }: { onChallenge: () => void }) {
  const router = useRouter()
  const link = useStoredLink()
  const [roundCount, setRoundCount] = useState(10)
  const [progressive, setProgressive] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const path = buildSoloGamePath({ url: link.url, count: roundCount, progressive })
    if (path) router.push(path)
  }

  return (
    <FormCard
      title="Blind test classique"
      intro="Colle le lien d'un profil ou d'une playlist Spotify ou Deezer. On tire des morceaux au hasard, à toi de trouver le titre et l'artiste."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <MusicLinkField id="playlist-url" link={link} />
        <OptionPicker label="Nombre de titres" options={ROUND_OPTIONS} value={roundCount} onChange={setRoundCount} />
        <label className="flex cursor-pointer select-none items-center gap-3">
          <input
            type="checkbox"
            checked={progressive}
            onChange={e => setProgressive(e.target.checked)}
            className="h-4 w-4 rounded border-[#2e2014] bg-[#efe5d0] accent-[#c65133]"
          />
          <span className="text-sm text-[#6b573f]">
            <span className="font-bold text-[#2e2014]">Mode progressif</span> : 30 s par titre au début, puis 20 s, puis 10 s
          </span>
        </label>
        <button
          type="submit"
          disabled={!link.url.trim()}
          className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Lancer le blind test
        </button>
      </form>
      {/* Le defi se lance depuis son onglet : on le rappelle ici, c'est la
          question qu'on se pose une fois sa playlist collee. */}
      <p className="border-t-2 border-dotted border-[rgba(46,32,20,.3)] pt-4 text-sm text-[#6b573f]">
        Envie de jouer contre un pote ?{" "}
        <button type="button" onClick={onChallenge} className="font-bold text-[#2e2014] underline decoration-[#c65133] decoration-2 underline-offset-2 hover:text-[#c65133]">
          Lance un défi
        </button>
        , il rejouera les mêmes morceaux que toi.
      </p>
    </FormCard>
  )
}
