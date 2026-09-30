// Outils partages par les scenarios navigateur : la sonde audio injectee dans
// la page, le juge du son, et l'ouverture d'une page equipee.
import fs from "node:fs"
import { catalog } from "./catalog.mjs"

export const APP = "http://blindz-test.localhost:3180/blindify"
const KEY = fs.readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
export const sleep = ms => new Promise(r => setTimeout(r, ms))

export const PROBE = `(() => {
  const P = window.__probe = { samples: [], errors: [], plays: 0 }
  let ctx = null, el = null
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...a) {
    try {
      P.plays++
      ctx = ctx || new AudioContext()
      if (!this.__an) {
        const an = ctx.createAnalyser(); an.fftSize = 8192
        ctx.createMediaElementSource(this).connect(an); an.connect(ctx.destination)
        this.__an = an
      }
      el = this
      if (ctx.state === "suspended") ctx.resume()
    } catch (e) { P.errors.push(String(e).slice(0, 160)) }
    return play.apply(this, a)
  }
  const td = new Float32Array(8192), fd = new Float32Array(4096)
  setInterval(() => {
    if (!el || !el.__an) return
    const an = el.__an
    an.getFloatTimeDomainData(td)
    let s = 0; for (let i = 0; i < td.length; i++) s += td[i] * td[i]
    an.getFloatFrequencyData(fd)
    let b = 1; for (let i = 2; i < fd.length; i++) if (fd[i] > fd[b]) b = i
    P.samples.push([Date.now(), Math.round(Math.sqrt(s / td.length) * 1000) / 1000, Math.round(b * ctx.sampleRate / an.fftSize), el.paused ? 1 : 0])
  }, 100)
})()`

// Le silence numerique vaut 0 : un seuil bas suffit. Sur ordinateur le jeu
// demarre a 35 % de volume et l'ecran central mesure autour de 0,01 (-40 dB),
// d'ou un seuil bien en dessous. Le niveau median est rapporte a part.
export const LOUD = 0.003

/** Juge le son releve contre les manches : demarrage, bonne chanson, arret. */
export function judgeAudio(samples, windows, { expectSound, maxOnsetMs = 3000 }) {
  const rounds = []
  const problems = []
  windows.forEach((w, i) => {
    const next = windows[i + 1]?.startAt ?? w.revealAt + 5000
    const inRound = samples.filter(([t]) => t >= w.startAt && t <= w.revealAt)
    const loud = inRound.filter(([, rms]) => rms > LOUD)
    const after = samples.filter(([t]) => t >= w.revealAt + 1200 && t < next)
    const afterLoud = after.filter(([, rms]) => rms > LOUD).length
    const segs = []
    for (const [t, rms] of inRound.concat(after)) {
      const on = rms > LOUD, rel = t - w.startAt, last = segs.at(-1)
      if (on && last && rel - last[1] <= 250) last[1] = rel
      else if (on) segs.push([rel, rel])
    }
    const levels = loud.map(s => s[1]).sort((a, b) => a - b)
    const r = { round: w.round, start: w.startAt, revealAt: w.revealAt, sound: segs, level: levels.length ? levels[Math.floor(levels.length / 2)] : 0 }
    if (expectSound) {
      const onset = loud.length ? loud[0][0] - w.startAt : null
      const tail = inRound.filter(([t]) => onset != null && t >= w.startAt + onset)
      const coverage = tail.length ? loud.length / tail.length : 0
      const freqs = loud.map(s => s[2]).sort((a, b) => a - b)
      const freq = freqs.length ? freqs[Math.floor(freqs.length / 2)] : null
      r.onsetMs = onset; r.coverage = Math.round(coverage * 100) / 100; r.freq = freq; r.expectedFreq = w.expectedFreq
      r.freqOk = freq != null && w.expectedFreq != null ? Math.abs(freq - w.expectedFreq) <= 30 : null
      r.stopOk = after.length === 0 || afterLoud / after.length < 0.2
      if (onset == null) problems.push(`manche ${w.round} : aucun son`)
      else {
        if (onset > maxOnsetMs) problems.push(`manche ${w.round} : le son demarre ${(onset / 1000).toFixed(1)} s apres le debut`)
        if (coverage < 0.7) problems.push(`manche ${w.round} : son coupe (${Math.round(coverage * 100)} % de la manche)`)
        if (r.freqOk === false) problems.push(`manche ${w.round} : mauvais morceau (${freq} Hz entendu, ${w.expectedFreq} Hz attendu)`)
      }
      if (!r.stopOk) problems.push(`manche ${w.round} : le son continue apres la revelation`)
      r.ok = onset != null && onset <= maxOnsetMs && coverage >= 0.7 && r.freqOk !== false && r.stopOk
    } else {
      r.ok = loud.length === 0 && afterLoud === 0
      if (!r.ok) problems.push(`manche ${w.round} : du son sur un ecran qui doit rester muet`)
    }
    rounds.push(r)
  })
  const lv = rounds.map(r => r.level).filter(Boolean).sort((a, b) => a - b)
  const median = lv.length ? lv[Math.floor(lv.length / 2)] : 0
  // Reference : le niveau du fichier lui-meme (sinus ffmpeg a 1/8 de la pleine
  // echelle, x0,35 a l'encodage : ~0,031 efficace). 0 dB = lu a plein volume.
  return { rounds, problems, ok: problems.length === 0, levelDb: median ? Math.round(20 * Math.log10(median / 0.031)) : null }
}

export async function newPage(browser, opts, tag, problems) {
  const ctx = await browser.newContext(opts)
  await ctx.setExtraHTTPHeaders({ "X-E2E-Key": KEY })
  await ctx.addInitScript(PROBE)
  const page = await ctx.newPage()
  page.on("pageerror", e => problems.push(`${tag} : erreur JS ${String(e).slice(0, 140)}`))
  page.on("response", async r => {
    if (/\/api\/auth\/(guest|me)/.test(r.url())) {
      try { const d = await r.json(); if (d?.data?.user?.id) page.__uid = d.data.user.id } catch { /* pas ce call */ }
    }
  })
  return { ctx, page }
}


const CAT = catalog()
/** Le morceau qui joue en ce moment, reconnu a sa frequence. Attend jusqu'a
 *  `waitMs` qu'un son stable (8 releves d'affilee) apparaisse, sinon null. */
export async function heardTrack(page, waitMs = 8000) {
  const until = Date.now() + waitMs
  do {
    const s = await page.evaluate(() => window.__probe.samples.slice(-8))
    const f = s.filter(x => x[1] > LOUD).map(x => x[2]).sort((a, b) => a - b)
    if (f.length >= 8) {
      const freq = f[Math.floor(f.length / 2)]
      return CAT[Math.max(0, Math.min(CAT.length - 1, Math.round((freq - 300) / 55)))]
    }
    await sleep(250)
  } while (Date.now() < until)
  return null
}
