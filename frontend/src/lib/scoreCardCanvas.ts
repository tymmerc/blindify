const BG_COLOR = "#050505"
const PURPLE = "#a855f7"
const WHITE = "#ffffff"
const MUTED = "#94a3b8"
const GREEN = "#22c55e"
const YELLOW = "#eab308"
const RED = "#ef4444"

const WIDTH = 1200
const HEIGHT = 630

const VERDICT_COLOR: Record<string, string> = {
  correct: GREEN,
  close: YELLOW,
  wrong: RED,
}

const FONT = "system-ui, sans-serif"

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = WIDTH
  canvas.height = HEIGHT
  return canvas
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

function drawTitle(ctx: CanvasRenderingContext2D): number {
  const y = 70

  // Purple glow
  ctx.save()
  ctx.shadowColor = PURPLE
  ctx.shadowBlur = 30
  ctx.font = `bold 52px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.textAlign = "center"
  ctx.fillText("BLINDIFY", WIDTH / 2, y)
  ctx.restore()

  // Subtitle
  ctx.font = `500 22px ${FONT}`
  ctx.fillStyle = PURPLE
  ctx.textAlign = "center"
  ctx.fillText("Blind Test", WIDTH / 2, y + 34)

  return y + 34
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  stats: { rounds: number; correct: number; bestStreak: number; points: number },
  startY: number,
): number {
  let y = startY + 50

  // Points
  ctx.font = `bold 64px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.textAlign = "center"
  ctx.fillText(`${stats.points} pts`, WIDTH / 2, y)
  y += 36

  // Correct count
  ctx.font = `400 22px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.fillText(`${stats.correct}/${stats.rounds} correct`, WIDTH / 2, y)
  y += 32

  // Best streak
  const streakSuffix = stats.bestStreak >= 3 ? " 🔥" : ""
  ctx.font = `500 20px ${FONT}`
  ctx.fillStyle = PURPLE
  ctx.fillText(`Série max: ${stats.bestStreak}${streakSuffix}`, WIDTH / 2, y)

  return y
}

function drawRoundDots(
  ctx: CanvasRenderingContext2D,
  roundStates: string[],
  startY: number,
): number {
  const filtered = roundStates.filter((s) => s !== "current" && s !== "pending")
  if (filtered.length === 0) return startY

  const y = startY + 36
  const dotRadius = 8
  const gap = 6
  const totalWidth = filtered.length * (dotRadius * 2 + gap) - gap
  let x = (WIDTH - totalWidth) / 2 + dotRadius

  for (const state of filtered) {
    ctx.beginPath()
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
    ctx.fillStyle = VERDICT_COLOR[state] ?? "#6b7280"
    ctx.fill()
    x += dotRadius * 2 + gap
  }

  return y + dotRadius
}

function drawTrackList(
  ctx: CanvasRenderingContext2D,
  tracks: Array<{ title: string; artist: string }>,
  startY: number,
): number {
  if (tracks.length === 0) return startY

  let y = startY + 36
  const maxDisplay = 5
  const displayed = tracks.slice(0, maxDisplay)

  ctx.textAlign = "center"

  for (const track of displayed) {
    const titleText = truncate(track.title, 35)
    const artistText = truncate(track.artist, 25)
    const line = `${titleText}  —  ${artistText}`

    ctx.font = `400 17px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(line, WIDTH / 2, y)
    y += 26
  }

  if (tracks.length > maxDisplay) {
    const remaining = tracks.length - maxDisplay
    ctx.font = `italic 16px ${FONT}`
    ctx.fillStyle = "#64748b"
    ctx.fillText(`... et ${remaining} autre${remaining > 1 ? "s" : ""}`, WIDTH / 2, y)
    y += 26
  }

  return y
}

function drawWatermark(ctx: CanvasRenderingContext2D): void {
  ctx.font = `400 15px ${FONT}`
  ctx.fillStyle = "#475569"
  ctx.textAlign = "center"
  ctx.fillText("tymmerc.eu/blindify", WIDTH / 2, HEIGHT - 24)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1).trimEnd() + "…"
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Failed to generate image blob"))
        }
      },
      "image/png",
    )
  })
}

export async function generateScoreCard(
  stats: { rounds: number; correct: number; bestStreak: number; points: number },
  roundStates: string[],
  tracks: Array<{ title: string; artist: string }>,
): Promise<Blob> {
  const canvas = createCanvas()
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context not available")
  }

  drawBackground(ctx)
  const titleEnd = drawTitle(ctx)
  const scoreEnd = drawScore(ctx, stats, titleEnd)
  const dotsEnd = drawRoundDots(ctx, roundStates, scoreEnd)
  drawTrackList(ctx, tracks, dotsEnd)
  drawWatermark(ctx)

  return canvasToBlob(canvas)
}
