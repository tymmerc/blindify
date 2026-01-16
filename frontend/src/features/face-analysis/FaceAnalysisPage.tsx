"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { loadFaceMeshBundle } from "@/features/tryon/faceMeshLoader"
import { analyzeFace, measureQuality, type FaceAnalysisSignals, type FaceQuality } from "./analyzer"

type CaptureMode = "camera" | "upload"

async function detectFaceFromCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const { FaceMesh } = await loadFaceMeshBundle()
    return await new Promise(resolve => {
      const mesh = new FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      })
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5 })
      mesh.onResults((results: any) => {
        resolve(Boolean(results.multiFaceLandmarks?.length))
        mesh.close?.()
      })
      mesh.send({ image: canvas })
    })
  } catch {
    return false
  }
}

function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>{label}</span>
        <span className="text-xs text-white/60">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-emerald-400" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  )
}

export function FaceAnalysisPage() {
  const [mode, setMode] = useState<CaptureMode>("camera")
  const [quality, setQuality] = useState<FaceQuality | null>(null)
  const [analysis, setAnalysis] = useState<FaceAnalysisSignals | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const startCamera = async () => {
      if (!videoRef.current) return
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        streamRef.current = stream
        videoRef.current.srcObject = stream
        setCameraError(null)
      } catch (err) {
        setCameraError("Caméra indisponible ou bloquée. Passe en mode upload.")
        setMode("upload")
      }
    }

    const stopCamera = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }

    if (mode === "camera") {
      startCamera()
    } else {
      stopCamera()
    }

    return stopCamera
  }, [mode])

  const runPipeline = async (source: CanvasImageSource, width: number, height: number) => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const maxWidth = 720
    const scale = width > maxWidth ? maxWidth / width : 1
    const targetWidth = Math.round(width * scale)
    const targetHeight = Math.round(height * scale)

    canvas.width = targetWidth
    canvas.height = targetHeight
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight)

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
    setPreviewUrl(canvas.toDataURL("image/png"))
    setLoading(true)
    const faceDetected = await detectFaceFromCanvas(canvas)
    const measuredQuality = measureQuality(imageData, faceDetected)
    const signals = analyzeFace(imageData, faceDetected)

    setQuality(measuredQuality)
    setAnalysis(signals)
    setLoading(false)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const src = e.target?.result
      if (!src) return
      const img = new Image()
      img.src = String(src)
      img.onload = () => runPipeline(img, img.naturalWidth, img.naturalHeight)
    }
    reader.readAsDataURL(file)
  }

  const captureFromCamera = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    if (video.videoWidth === 0) return
    runPipeline(video, video.videoWidth, video.videoHeight)
  }

  return (
    <div className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Analyse visage</p>
          <h1 className="text-3xl font-bold md:text-4xl">Lecture rapide des signaux de peau</h1>
          <p className="text-sm text-white/70">
            Upload ou capture en local, contrôle qualité (luminosité, netteté, visage détecté) puis extraction de signaux non médicaux.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={mode === "camera" ? "default" : "outline"} onClick={() => setMode("camera")}>
                  Caméra
                </Button>
                <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
                  Upload
                </Button>
              </div>
              {cameraError ? <span className="text-xs text-orange-300">{cameraError}</span> : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {mode === "camera" ? (
                <video ref={videoRef} autoPlay playsInline muted className="h-[320px] w-full object-cover" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Selfie analysé" className="h-[320px] w-full object-cover" />
              ) : (
                <div className="flex h-[320px] items-center justify-center text-sm text-white/60">Importe une photo pour commencer</div>
              )}
            </div>

            {mode === "upload" ? (
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/20 bg-black/30 px-4 py-3 text-sm text-white/70 hover:border-white/35">
                <span>Uploader un selfie (non stocké)</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            ) : (
              <Button type="button" onClick={captureFromCamera} disabled={loading} className="w-full">
                {loading ? "Analyse en cours…" : "Prendre une photo et analyser"}
              </Button>
            )}

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
              <p>Traitement en local : aucune image n’est envoyée.</p>
              <p className="text-white/60">Prototype de démonstration – ne constitue pas un diagnostic médical.</p>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="text-lg font-semibold">Résultats</h2>
            {quality ? (
              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
                <div className="flex items-center justify-between">
                  <span>Visage détecté</span>
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs">
                    {quality.faceDetected ? "Oui" : "Non"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-white/70">
                  <div>
                    Luminosité : <strong>{Math.round(quality.brightness * 100)}%</strong>
                  </div>
                  <div>
                    Flou : <strong>{Math.round(quality.blur * 100)}%</strong>
                  </div>
                </div>
                {!quality.ok ? (
                  <ul className="space-y-1 text-xs text-orange-300">
                    {quality.issues.map(issue => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-300">Qualité suffisante pour une lecture indicative.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/60">Charge ou capture une image pour déclencher l’analyse.</p>
            )}

            {analysis ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <SignalBar label="Redness signals" value={analysis.redness_signals} />
                <SignalBar label="Dryness signals" value={analysis.dryness_signals} />
                <SignalBar label="Oiliness signals" value={analysis.oiliness_signals} />
                <SignalBar label="Texture signals" value={analysis.texture_signals} />
                <SignalBar label="Confiance de lecture" value={analysis.confidence} />
                {analysis.notes.length ? (
                  <div className="space-y-1 text-sm text-white/70">
                    {analysis.notes.map(note => (
                      <p key={note}>• {note}</p>
                    ))}
                  </div>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="w-full">
                  Voir des recommandations
                </Button>
              </div>
            ) : null}

            <canvas ref={canvasRef} className="hidden" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  )
}
