"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { publicPath } from "@/lib/publicPath"
import { buildSoloGamePath, isChallengeCode, normalizeChallengeCode } from "@/lib/soloSetup"
import { FormCard, MusicLinkField, OptionPicker, ROUND_OPTIONS, useStoredLink } from "./SoloFormParts"

// Onglet "Defier un ami" : on CREE un defi (partie normale, puis lien a
// envoyer), et en dessous on REJOINT celui d'un pote. Avant, cet onglet ne
// proposait que de rejoindre : personne ne trouvait comment en lancer un.

function JoinChallenge() {
  const [code, setCode] = useState("")
  const ready = isChallengeCode(code)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    // publicPath : pas de /blindify en dur, la prod est servie a la racine.
    window.location.href = `${publicPath("/challenge/")}?code=${encodeURIComponent(code)}`
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t-2 border-dotted border-[rgba(46,32,20,.3)] pt-5">
      <div className="space-y-1">
        <h3 className="font-display text-lg font-semibold text-[#2e2014]">On t&apos;a envoyé un défi ?</h3>
        <p className="text-sm text-[#6b573f]">Ouvre le lien reçu, ou tape son code ici.</p>
      </div>
      <label htmlFor="challenge-code" className="sr-only">Code du défi</label>
      <div className="flex gap-2">
        <input
          id="challenge-code"
          type="text"
          value={code}
          onChange={e => setCode(normalizeChallengeCode(e.target.value).slice(0, 12))}
          placeholder="Ex. K7Q2M9XA"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-3 text-center font-display text-lg font-semibold tracking-[0.2em] text-[#2e2014] outline-none transition placeholder:font-sans placeholder:text-sm placeholder:italic placeholder:tracking-normal placeholder:text-[#b3a182] focus:border-[#c65133]"
        />
        <button
          type="submit"
          disabled={!ready}
          className="shrink-0 rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-4 text-sm font-bold text-[#f4ecdb] shadow-[3px_3px_0_rgba(46,32,20,.3)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_rgba(46,32,20,.3)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Rejoindre le défi
        </button>
      </div>
    </form>
  )
}

export function ChallengeTab() {
  const router = useRouter()
  const link = useStoredLink()
  const [roundCount, setRoundCount] = useState(10)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const path = buildSoloGamePath({ url: link.url, count: roundCount, challenge: true })
    if (path) router.push(path)
  }

  return (
    <FormCard
      title="Défier un ami"
      intro="Tu joues une partie sur ta musique, puis tu envoies le lien à un pote. Il tombe sur les mêmes morceaux, dans le même ordre, et doit battre ton score."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <MusicLinkField id="defi-url" link={link} />
        <OptionPicker label="Nombre de titres" options={ROUND_OPTIONS} value={roundCount} onChange={setRoundCount} />
        <button
          type="submit"
          disabled={!link.url.trim()}
          className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Jouer et lancer le défi
        </button>
        <p className="text-center text-[12px] text-[#8a7558]">
          Le lien à envoyer s&apos;affiche à la fin de ta partie.
        </p>
      </form>
      <JoinChallenge />
    </FormCard>
  )
}
