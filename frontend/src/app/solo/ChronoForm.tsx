"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FormCard, MusicLinkField, OptionPicker, useStoredLink, type PickerOption } from "./SoloFormParts"

const DURATION_OPTIONS: PickerOption[] = [
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
]

export function ChronoForm() {
  const router = useRouter()
  const link = useStoredLink()
  const [duration, setDuration] = useState(180)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = link.url.trim()
    if (!trimmed) return
    router.push(`/chrono?source=quickplay&quickUrl=${encodeURIComponent(trimmed)}&duration=${duration}`)
  }

  return (
    <FormCard
      title="Chrono"
      intro="Les titres s'enchaînent sans pause. Trouves-en un maximum avant la fin du temps."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <MusicLinkField id="chrono-url" link={link} />
        <OptionPicker label="Durée du chrono" options={DURATION_OPTIONS} value={duration} onChange={setDuration} />
        <button
          type="submit"
          disabled={!link.url.trim()}
          className="btn-neon w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Lancer le chrono
        </button>
      </form>
    </FormCard>
  )
}
