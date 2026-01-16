export type FaceQuality = {
  brightness: number
  blur: number
  faceDetected: boolean
  ok: boolean
  issues: string[]
}

export type FaceAnalysisSignals = {
  redness_signals: number
  dryness_signals: number
  oiliness_signals: number
  texture_signals: number
  confidence: number
  notes: string[]
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function computeClarityMetric(data: Uint8ClampedArray, width: number, height: number) {
  let diffSum = 0
  let samples = 0
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80))

  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const idx = (y * width + x) * 4
      const idxRight = (y * width + (x + step)) * 4
      const idxDown = ((y + step) * width + x) * 4
      const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      const right = (data[idxRight] + data[idxRight + 1] + data[idxRight + 2]) / 3
      const down = (data[idxDown] + data[idxDown + 1] + data[idxDown + 2]) / 3
      diffSum += Math.abs(current - right) + Math.abs(current - down)
      samples += 2
    }
  }

  if (samples === 0) return 0
  const normalized = diffSum / (samples * 255)
  return clamp01(normalized)
}

export function measureQuality(image: ImageData, faceDetected: boolean): FaceQuality {
  const { data, width, height } = image
  const totalPixels = width * height
  let brightnessSum = 0

  for (let i = 0; i < data.length; i += 4) {
    brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3
  }

  const avgBrightness = brightnessSum / (totalPixels * 255)
  const clarity = computeClarityMetric(data, width, height)
  const blurScore = clamp01(1 - clarity)

  const issues: string[] = []
  if (avgBrightness < 0.22) issues.push("Image trop sombre")
  if (avgBrightness > 0.8) issues.push("Image trop lumineuse")
  if (blurScore > 0.65) issues.push("Photo floue ou mouvement")
  if (!faceDetected) issues.push("Aucun visage détecté")

  return {
    brightness: clamp01(avgBrightness),
    blur: blurScore,
    faceDetected,
    ok: issues.length === 0,
    issues,
  }
}

export function analyzeFace(image: ImageData, faceDetected: boolean): FaceAnalysisSignals {
  const { data, width, height } = image
  const totalPixels = width * height
  let sumR = 0
  let sumG = 0
  let sumB = 0

  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]
    sumG += data[i + 1]
    sumB += data[i + 2]
  }

  const avgR = sumR / totalPixels / 255
  const avgG = sumG / totalPixels / 255
  const avgB = sumB / totalPixels / 255

  const meanColor = (avgR + avgG + avgB) / 3
  const clarity = computeClarityMetric(data, width, height)

  const redness = clamp01(avgR - (avgG + avgB) / 2 + 0.5)
  const oiliness = clamp01(meanColor * 0.5 + clarity * 0.3)
  const dryness = clamp01(1 - oiliness * 0.6 - meanColor * 0.2)
  const texture = clamp01(clarity)

  const brightnessBalance = 1 - Math.abs(meanColor - 0.55)
  const confidence = clamp01((brightnessBalance + (1 - dryness) + (faceDetected ? 1 : 0)) / 3)

  const notes: string[] = []
  if (redness > 0.7) notes.push("Teint chaleureux détecté")
  if (oiliness > 0.65) notes.push("Zones lumineuses : privilégier des textures mates")
  if (dryness > 0.65) notes.push("Texture mate : viser des soins plus nourrissants")
  if (texture > 0.65) notes.push("Grain de peau net, idéal pour finis satinés")

  return {
    redness_signals: redness,
    dryness_signals: dryness,
    oiliness_signals: oiliness,
    texture_signals: texture,
    confidence,
    notes,
  }
}
