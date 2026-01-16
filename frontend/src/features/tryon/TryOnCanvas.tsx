"use client"

import { useEffect, useRef, useState } from "react"
import { loadFaceMeshBundle } from "./faceMeshLoader"
import type { TryOnShade } from "@/config/partners/tryonCatalog"
import type { TryOnType } from "@/config/partners/partnerBrands"

export type TryOnCanvasMode = "camera" | "upload"
export type TryOnCanvasStatus = "idle" | "loading" | "ready" | "permission-denied" | "error"

type TryOnCanvasProps = {
  shade: TryOnShade
  tryOnType: TryOnType
  mode: TryOnCanvasMode
  imageDataUrl?: string
  overlayEnabled: boolean
  onStatusChange?: (status: TryOnCanvasStatus) => void
  onFaceTracked?: (present: boolean) => void
}

const LIPS_PATH = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91]
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "")
  const bigint = parseInt(sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function TryOnCanvas({
  shade,
  tryOnType,
  mode,
  imageDataUrl,
  overlayEnabled,
  onStatusChange,
  onFaceTracked,
}: TryOnCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastLandmarks = useRef<{ width: number; height: number; points: any[] } | null>(null)
  const [status, setStatus] = useState<TryOnCanvasStatus>("idle")
  const statusRef = useRef<TryOnCanvasStatus>("idle")
  const overlayRef = useRef<boolean>(overlayEnabled)
  const shadeRef = useRef<TryOnShade>(shade)

  const emitStatus = (next: TryOnCanvasStatus) => {
    setStatus(next)
    statusRef.current = next
    onStatusChange?.(next)
  }

  useEffect(() => {
    let active = true
    let faceMesh: any
    let camera: any
    let stream: MediaStream | null = null

    const renderOverlay = (landmarks: any[], width: number, height: number) => {
      if (!canvasRef.current) return
      const ctx = canvasRef.current.getContext("2d")
      if (!ctx) return
      canvasRef.current.width = width
      canvasRef.current.height = height
      ctx.clearRect(0, 0, width, height)
      if (!overlayRef.current) return

      const drawPath = (points: number[]) => {
        ctx.beginPath()
        points.forEach((idx, i) => {
          const point = landmarks[idx]
          const x = point.x * width
          const y = point.y * height
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
      }

      if (tryOnType === "lips") {
        drawPath(LIPS_PATH)
        ctx.fillStyle = hexToRgba(shadeRef.current.hex, 0.55)
        ctx.filter = "blur(0.5px)"
        ctx.fill()
      } else if (tryOnType === "eyes") {
        ctx.fillStyle = hexToRgba(shadeRef.current.hex, 0.22)
        drawPath(LEFT_EYE)
        ctx.fill()
        drawPath(RIGHT_EYE)
        ctx.fill()
      } else if (tryOnType === "liner") {
        ctx.strokeStyle = hexToRgba(shadeRef.current.hex, 0.8)
        ctx.lineWidth = 3
        ctx.lineCap = "round"
        const drawLiner = (points: number[]) => {
          ctx.beginPath()
          points.forEach((idx, i) => {
            const p = landmarks[idx]
            const x = p.x * width
            const y = p.y * height
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.stroke()
        }
        drawLiner(LEFT_EYE)
        drawLiner(RIGHT_EYE)
      }
    }

    const handleResults = (results: any) => {
      const face = results.multiFaceLandmarks?.[0]
      const image = results.image
      const width = image?.width || videoRef.current?.videoWidth || canvasRef.current?.width || 640
      const height = image?.height || videoRef.current?.videoHeight || canvasRef.current?.height || 480

      if (face) {
        onFaceTracked?.(true)
        lastLandmarks.current = { width, height, points: face }
        renderOverlay(face, width, height)
        if (statusRef.current !== "ready") emitStatus("ready")
      } else {
        onFaceTracked?.(false)
        if (canvasRef.current) canvasRef.current.getContext("2d")?.clearRect(0, 0, width, height)
      }
    }

    const startCamera = async () => {
      if (!videoRef.current) return
      emitStatus("loading")
      try {
        const { FaceMesh, Camera } = await loadFaceMeshBundle()
        faceMesh = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
        })
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })
        faceMesh.onResults(handleResults)

        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        videoRef.current.srcObject = stream
        camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!active) return
            await faceMesh.send({ image: videoRef.current })
          },
          width: 640,
          height: 480,
        })
        camera.start()
      } catch (err) {
        const denied = err instanceof DOMException && err.name === "NotAllowedError"
        emitStatus(denied ? "permission-denied" : "error")
      }
    }

    const processUpload = async (dataUrl: string) => {
      emitStatus("loading")
      try {
        const { FaceMesh } = await loadFaceMeshBundle()
        faceMesh = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
        })
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.6,
        })
        faceMesh.onResults(handleResults)

        const img = new Image()
        img.src = dataUrl
        img.onload = async () => {
          await faceMesh.send({ image: img })
        }
        img.onerror = () => emitStatus("error")
      } catch (err) {
        emitStatus("error")
      }
    }

    if (mode === "camera") {
      startCamera()
    } else if (mode === "upload" && imageDataUrl) {
      processUpload(imageDataUrl)
    }

    return () => {
      active = false
      if (camera?.stop) camera.stop()
      if (stream) stream.getTracks().forEach(track => track.stop())
      faceMesh?.close?.()
    }
  }, [mode, imageDataUrl, tryOnType, onFaceTracked])

  useEffect(() => {
    // Re-render overlay when shade or overlay toggle changes
    overlayRef.current = overlayEnabled
    shadeRef.current = shade
    if (lastLandmarks.current && canvasRef.current) {
      const { width, height, points } = lastLandmarks.current
      const ctx = canvasRef.current.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      if (!overlayEnabled) return
      const fakeResults = { multiFaceLandmarks: [points], image: { width, height } }
      // Force re-render through existing flow
      const face = fakeResults.multiFaceLandmarks[0]
      if (face) {
        if (tryOnType === "lips") {
          const drawPath = (indices: number[]) => {
            ctx.beginPath()
            indices.forEach((idx, i) => {
              const p = face[idx]
              const x = p.x * width
              const y = p.y * height
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.closePath()
          }
          drawPath(LIPS_PATH)
          ctx.fillStyle = hexToRgba(shadeRef.current.hex, 0.55)
          ctx.fill()
        } else if (tryOnType === "eyes") {
          ctx.fillStyle = hexToRgba(shadeRef.current.hex, 0.22)
          const drawPath = (indices: number[]) => {
            ctx.beginPath()
            indices.forEach((idx, i) => {
              const p = face[idx]
              const x = p.x * width
              const y = p.y * height
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.closePath()
            ctx.fill()
          }
          drawPath(LEFT_EYE)
          drawPath(RIGHT_EYE)
        } else if (tryOnType === "liner") {
          ctx.strokeStyle = hexToRgba(shade.hex, 0.8)
          ctx.lineWidth = 3
          ctx.lineCap = "round"
          const drawLine = (indices: number[]) => {
            ctx.beginPath()
            indices.forEach((idx, i) => {
              const p = face[idx]
              const x = p.x * width
              const y = p.y * height
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
          }
          drawLine(LEFT_EYE)
          drawLine(RIGHT_EYE)
        }
      }
    }
  }, [shade.hex, overlayEnabled, tryOnType])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      {mode === "camera" ? (
        <video ref={videoRef} className="h-[360px] w-full object-cover" autoPlay playsInline muted />
      ) : imageDataUrl ? (
        <img src={imageDataUrl} alt="Selfie importée" className="h-[360px] w-full object-cover" />
      ) : (
        <div className="flex h-[360px] items-center justify-center text-sm text-white/60">Ajoute une photo pour commencer</div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur">
        {status === "loading" && "Chargement du modèle FaceMesh…"}
        {status === "permission-denied" && "Caméra bloquée : autorise l’accès ou passe en mode upload."}
        {status === "error" && "Impossible d’activer l’essai virtuel pour le moment."}
        {status === "ready" && "Visage détecté · superpose en direct"}
      </div>
    </div>
  )
}
