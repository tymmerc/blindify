import { Loader2 } from "lucide-react"

// Affiche pendant la navigation vers /modes (au lieu d'un ecran blanc/gris).
export default function ModesLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper text-ink-2">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-terra-txt" />
        <p className="text-[11px] font-bold uppercase tracking-[0.32em]">Blindz</p>
      </div>
    </div>
  )
}
