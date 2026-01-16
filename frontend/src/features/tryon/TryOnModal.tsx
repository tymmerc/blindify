"use client"

import { type ChangeEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { TryOnShade } from "@/config/partners/tryonCatalog"
import type { TryOnType } from "@/config/partners/partnerBrands"
import { TryOnCanvas, type TryOnCanvasMode, type TryOnCanvasStatus } from "./TryOnCanvas"
import type { TryOnEligibility } from "./eligibility"

type TryOnModalProps = {
  productName: string
  brand: string
  eligibility: TryOnEligibility
  onClose: () => void
  heroImage?: string
}

export function TryOnModal({ productName, brand, eligibility, onClose, heroImage }: TryOnModalProps) {
  const shades = eligibility.shades ?? []
  const [selectedShade, setSelectedShade] = useState<TryOnShade | undefined>(shades[0])
  const [mode, setMode] = useState<TryOnCanvasMode>("camera")
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [uploadDataUrl, setUploadDataUrl] = useState<string | undefined>(undefined)
  const [canvasStatus, setCanvasStatus] = useState<TryOnCanvasStatus>("idle")
  const [faceDetected, setFaceDetected] = useState(false)

  const tryOnType = eligibility.tryOnType as TryOnType | undefined
  const activeShade = useMemo(() => selectedShade ?? shades[0], [selectedShade, shades])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    if (!selectedShade && shades.length > 0) {
      setSelectedShade(shades[0])
    }
  }, [selectedShade, shades])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result
      if (result) {
        setUploadDataUrl(String(result))
        setMode("upload")
      }
    }
    reader.readAsDataURL(file)
  }

  const handleStatusChange = (status: TryOnCanvasStatus) => {
    setCanvasStatus(status)
    if (status === "permission-denied") {
      setMode("upload")
    }
  }

  if (!tryOnType || !activeShade) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="relative w-full max-w-5xl rounded-3xl border border-white/12 bg-[#0b0b0f] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
        >
          Fermer
        </button>

        <div className="grid gap-6 md:grid-cols-[1.05fr_1.2fr]">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Essai virtuel</p>
              <h3 className="text-2xl font-semibold text-white">{productName}</h3>
              <p className="text-sm text-white/60">Marque partenaire : {brand}</p>
            </div>

            {heroImage ? (
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <img src={heroImage} alt={productName} className="h-40 w-full object-cover opacity-90" />
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Sélectionne la teinte</p>
              <div className="flex flex-wrap gap-2">
                {shades.map(shade => {
                  const isActive = activeShade?.id === shade.id
                  return (
                    <button
                      key={shade.id}
                      type="button"
                      onClick={() => setSelectedShade(shade)}
                      className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm transition hover:border-white/25"
                      style={{
                        borderColor: isActive ? "rgba(255,255,255,0.6)" : undefined,
                        boxShadow: isActive ? `0 0 0 2px ${shade.hex}30` : undefined,
                      }}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-white/20"
                        style={{ backgroundColor: shade.hex }}
                        aria-hidden
                      />
                      <span className="text-white/80">{shade.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Source</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "camera" ? "default" : "outline"}
                    onClick={() => setMode("camera")}
                  >
                    Caméra
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "upload" ? "default" : "outline"}
                    onClick={() => setMode("upload")}
                  >
                    Upload selfie
                  </Button>
                </div>
              </div>
              {mode === "upload" ? (
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/20 bg-black/20 px-3 py-2 text-sm text-white/70 hover:border-white/35">
                  <span>Importer une photo (non conservée)</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              ) : null}
              <div className="flex items-center justify-between text-sm text-white/70">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={overlayEnabled}
                    onChange={e => setOverlayEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-white/30 bg-black/30"
                  />
                  <span>Avant / Après</span>
                </label>
                <span className="text-xs text-white/50">
                  {faceDetected ? "Visage suivi" : "Cadre-toi face caméra pour commencer"}
                </span>
              </div>
            </div>

            <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              <p>Traitement local uniquement : la vidéo et les selfies restent dans le navigateur.</p>
              <p>Prototype de démonstration – ne constitue pas un diagnostic médical.</p>
              {canvasStatus === "permission-denied" ? (
                <p className="text-orange-300">Autorise la caméra ou reste en mode upload.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <TryOnCanvas
              shade={activeShade}
              tryOnType={tryOnType}
              mode={mode}
              imageDataUrl={uploadDataUrl}
              overlayEnabled={overlayEnabled}
              onStatusChange={handleStatusChange}
              onFaceTracked={setFaceDetected}
            />
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              <span>Type d’essai : {tryOnType === "lips" ? "Lèvres" : tryOnType === "liner" ? "Eye-liner" : "Yeux"}</span>
              <span>Teinte : {activeShade.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
