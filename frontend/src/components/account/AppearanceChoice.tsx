"use client"

import { useTheme } from "@/contexts/ThemeContext"
import type { ThemeChoice } from "@/lib/theme"

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "clair", label: "Clair" },
  { value: "sombre", label: "Sombre" },
]

/** « Apparence » dans Mon compte (T30) : le seul endroit pour revenir en auto. */
export function AppearanceChoice() {
  const { choix, choisir } = useTheme()
  return (
    <fieldset>
      <legend className="sr-only">Apparence</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(o => {
          const actif = choix === o.value
          return (
            <label
              key={o.value}
              className={`cursor-pointer rounded-full border-[1.5px] border-line px-4 py-1.5 text-sm font-bold transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terra ${
                actif ? "bg-ink-block text-on-ink" : "bg-paper-deep text-ink hover:bg-well"
              }`}
            >
              <input
                type="radio"
                name="apparence"
                value={o.value}
                checked={actif}
                onChange={() => choisir(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-ink-2">Comme ton téléphone ou ton ordi</p>
    </fieldset>
  )
}
