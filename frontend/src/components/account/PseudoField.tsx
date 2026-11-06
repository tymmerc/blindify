"use client"

import { useState, type FormEvent } from "react"
import { NICKNAME_KEY, writeStored } from "@/lib/soloSetup"
import { PSEUDO_MIN, validPseudo } from "@/lib/accountView"

// Le pseudo propose quand on cree ou rejoint une salle. Il vit dans ce
// navigateur (comme sur les pages des modes) : pas d'appel au serveur, et les
// parties deja jouees gardent le nom qu'elles avaient.
export function PseudoField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  const clean = validPseudo(value)
  const unchanged = clean !== null && clean === saved

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!clean) {
      setError(`Au moins ${PSEUDO_MIN} caractères.`)
      return
    }
    writeStored(NICKNAME_KEY, clean)
    setValue(clean)
    setSaved(clean)
    setError(null)
  }

  return (
    <form onSubmit={save} noValidate>
      <label htmlFor="pseudo" className="sr-only">
        Ton pseudo
      </label>
      <div className="flex gap-2">
        <input
          id="pseudo"
          value={value}
          onChange={e => {
            setValue(e.target.value)
            setError(null)
          }}
          maxLength={40}
          autoComplete="nickname"
          placeholder="Ton pseudo"
          className="min-w-0 flex-1 rounded-md border-[1.5px] border-[#2e2014] bg-[#fbf6ea] px-3 py-2 text-base text-[#2e2014] outline-none focus:shadow-[2px_2px_0_#2e2014]"
        />
        <button
          type="submit"
          disabled={unchanged}
          className="shrink-0 rounded-md border-[1.5px] border-[#2e2014] bg-[#2e2014] px-4 py-2 text-sm font-bold text-[#f4ecdb] transition hover:bg-[#c65133] hover:border-[#c65133] disabled:cursor-default disabled:bg-transparent disabled:text-[#8a7558] disabled:border-[rgba(46,32,20,.3)]"
        >
          {unchanged ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
      <p className={`mt-1.5 text-xs ${error ? "font-semibold text-[#9c2f1d]" : "text-[#8a7558]"}`} role={error ? "alert" : undefined}>
        {error ?? "C'est le nom proposé quand tu crées ou rejoins une salle."}
      </p>
    </form>
  )
}
