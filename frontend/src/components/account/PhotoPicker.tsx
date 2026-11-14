"use client"

import { useId, type ChangeEvent } from "react"
import { Camera, Loader2 } from "lucide-react"

export interface PhotoPickerProps {
  /** Ce qu'on montre dans le rond : apercu local ou photo deja en ligne. */
  src: string | null
  busy?: boolean
  error?: string | null
  onPick: (file: File) => void
  onRemove: () => void
  /** Ce qu'on ecrit sous le rond vide. */
  emptyLabel?: string
}

/**
 * Le rond « ajouter une photo » (T39). Un vrai champ fichier : sur telephone,
 * accept="image/*" propose la galerie ou l'appareil photo (pas de capture
 * forcee). Le choix est rendu au parent, qui reduit et envoie la photo.
 */
export function PhotoPicker({ src, busy = false, error, onPick, onRemove, emptyLabel = "Ajouter une photo" }: PhotoPickerProps) {
  const inputId = useId()

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Vide le champ : reprendre la meme photo apres l'avoir retiree doit marcher.
    e.target.value = ""
    if (file) onPick(file)
  }

  return (
    <div className="flex flex-col items-center gap-2" data-testid="photo-picker">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="peer sr-only"
        onChange={handleChange}
        disabled={busy}
        data-testid="photo-input"
      />
      <label
        htmlFor={inputId}
        className={`relative grid h-[84px] w-[84px] cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-line text-ink-2 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-line ${
          src
            ? "bg-paper shadow-[3px_3px_0_rgb(var(--c-shadow))]"
            : "border-dashed bg-paper-deep hover:border-solid hover:bg-paper-strong"
        } ${busy ? "cursor-wait" : ""}`}
      >
        <span className="sr-only">{src ? "Changer ta photo" : emptyLabel}</span>
        {src ? (
          // Apercu local (blob:) ou photo de 256 px : rien a optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <Camera size={24} aria-hidden />
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-[rgb(var(--c-paper)/.7)]">
            <Loader2 size={20} className="animate-spin text-ink" aria-hidden />
          </span>
        ) : null}
      </label>
      {src ? (
        <div className="flex items-center gap-3 text-[12px] font-semibold">
          <label htmlFor={inputId} className="cursor-pointer text-ink-2 underline decoration-[1.5px] underline-offset-2 transition hover:text-ink" aria-hidden>
            Changer
          </label>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-ink-2 underline decoration-[1.5px] underline-offset-2 transition hover:text-ink disabled:opacity-50"
          >
            Retirer
          </button>
        </div>
      ) : (
        <label htmlFor={inputId} className="cursor-pointer text-[12px] font-semibold text-ink-2 transition hover:text-ink" aria-hidden>
          {emptyLabel}
        </label>
      )}
      {error ? (
        <p role="alert" className="max-w-xs text-center text-[12px] font-bold text-rouge-txt">
          {error}
        </p>
      ) : null}
    </div>
  )
}
