// Les verifications reelles de la sonde : ce que fait un joueur qui colle un
// lien de playlist dans le solo de blindz.app (page /solo/, POST
// /api/quick-play, lecture d'un extrait). fetch et sleep sont injectes : les
// tests (checks.test.mjs) jouent tous les cas sans reseau.
//
// Aucun compte, aucune salle : /api/quick-play ne demande pas de session et
// n'ecrit rien en base (session.id = 0). La sonde se presente par son
// User-Agent, pour la retirer des futures stats de visite.

export const BASE = "https://blindz.app"
export const ROUNDS = 10 // manches demandees : le solo par defaut
export const MIN_TRACKS = 5 // en dessous, le backend refuse la partie
export const RETRY_PAUSE_MS = 60_000
export const USER_AGENT = "blindz-sonde-prod/1 (+https://github.com/tymmerc/blindify)"
const LINK_TIMEOUT_MS = 90_000 // comme la verification de go-prod-2026-10-02-deezer.sh
const SHORT_TIMEOUT_MS = 15_000
// Recherche libre, comme le backend depuis le 02/10 : sert seulement au
// diagnostic quand la sonde echoue (un appel, jamais a chaque passage).
const DEEZER_SEARCH = "https://api.deezer.com/search?q=daft%20punk%20one%20more%20time&limit=3"
const SOLO_CHUNK = /\/_next\/static\/chunks\/app\/solo\/page-[a-f0-9]+\.js/

const headers = extra => ({ "User-Agent": USER_AGENT, ...extra })
const timeout = ms => AbortSignal.timeout(ms)
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Raison lisible d'une erreur reseau (delai, DNS, connexion refusee). */
export function reason(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "délai dépassé"
  const code = err?.cause?.code ?? err?.code
  return code ? String(code) : String(err?.message ?? err)
}

function safeHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return "adresse illisible"
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readJson(res) {
  return safeJson(await res.text().catch(() => ""))
}

export async function checkApi(fetchFn, base = BASE) {
  const check = { id: "api", label: "API (/api/health)" }
  try {
    const res = await fetchFn(`${base}/api/health`, { headers: headers(), signal: timeout(SHORT_TIMEOUT_MS) })
    const body = await readJson(res)
    if (res.ok && body?.data?.status === "ok") return { ...check, ok: true, suspect: null, detail: "ok" }
    return { ...check, ok: false, suspect: "app", code: "health", http: res.status, detail: `HTTP ${res.status}, l'API ne se dit pas en forme` }
  } catch (err) {
    return { ...check, ok: false, suspect: "app", code: "injoignable", detail: `blindz.app ne répond pas (${reason(err)})` }
  }
}

/** Sources autorisees pour l'audio par la CSP de la page (media-src, sinon default-src). */
export function parseMediaSrc(csp) {
  if (!csp) return null
  const directives = csp.split(";").map(d => d.trim().split(/\s+/))
  const media = directives.find(d => d[0] === "media-src") ?? directives.find(d => d[0] === "default-src")
  return media ? media.slice(1) : null
}

/** Le navigateur accepterait-il de lire cette adresse avec ces sources CSP ? */
export function allowedByCsp(url, sources, pageOrigin = BASE) {
  if (!sources) return true // pas de CSP : rien ne bloque
  let u
  try {
    u = new URL(url)
  } catch {
    return false // adresse d'extrait illisible : le navigateur ne la lirait pas
  }
  return sources.some(src => {
    if (src === "*") return true
    if (src === "'self'") return u.origin === pageOrigin
    if (/^[a-z][a-z0-9+.-]*:$/i.test(src)) return u.protocol === src.toLowerCase()
    const m = src.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)/i)
    if (!m) return false
    const [, scheme, wildcard, host] = m
    if (scheme && `${scheme.toLowerCase()}:` !== u.protocol) return false
    return wildcard ? u.hostname.endsWith(`.${host.toLowerCase()}`) : u.hostname === host.toLowerCase()
  })
}

export async function checkSoloPage(fetchFn, base = BASE) {
  const check = { id: "page", label: "Page du solo (/solo/)" }
  const ko = (detail, http) => ({ ...check, ok: false, suspect: "app", code: "page", http, detail, mediaSrc: null })
  try {
    const res = await fetchFn(`${base}/solo/`, { headers: headers(), signal: timeout(SHORT_TIMEOUT_MS) })
    const html = await res.text()
    if (!res.ok) return ko(`HTTP ${res.status}`, res.status)
    // nginx sert la landing (200) pour une page inconnue : on cherche le code du solo.
    const chunk = html.match(SOLO_CHUNK)?.[0]
    if (!chunk) return ko("la page servie n'est pas celle du solo (son code est absent)")
    const js = await fetchFn(`${base}${chunk}`, { headers: headers(), signal: timeout(SHORT_TIMEOUT_MS) })
    await js.text().catch(() => "")
    if (!js.ok || !/javascript/.test(js.headers.get("content-type") ?? "")) return ko(`le code du solo ne se charge pas (HTTP ${js.status})`, js.status)
    return { ...check, ok: true, suspect: null, detail: "ok", mediaSrc: parseMediaSrc(res.headers.get("content-security-policy")) }
  } catch (err) {
    return ko(`blindz.app ne répond pas (${reason(err)})`)
  }
}

/** Qui est probablement en cause pour un code d'erreur de /api/quick-play. */
export function suspectFor(code, provider) {
  // Les extraits viennent toujours de la recherche Deezer, meme pour un lien Spotify.
  if (code === "insufficient_tracks") return "deezer"
  if (code === "no_playlists" || code === "no_tracks") return provider
  return "app"
}

function linkFailure(check, res, body, ms) {
  const code = typeof body.error?.code === "string" ? body.error.code : "inconnu"
  const found = Number.isInteger(body.error?.details?.found) ? body.error.details.found : undefined
  const message = typeof body.error?.message === "string" ? ` « ${body.error.message} »` : ""
  const count = found != null ? ` (${found} titres jouables)` : ""
  return { ...check, ok: false, suspect: suspectFor(code, check.provider), code, http: res.status, ms, tracks: found, detail: `HTTP ${res.status} ${code}${message}${count}` }
}

/** Le lancement d'un solo par lien, exactement comme le front (GameClient.tsx). */
export async function checkLink(fetchFn, target, base = BASE) {
  const check = { id: target.id, label: target.label, url: target.url, provider: target.provider }
  const started = Date.now()
  let res
  let body
  try {
    res = await fetchFn(`${base}/api/quick-play`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Origin: base }),
      body: JSON.stringify({ url: target.url, count: ROUNDS }),
      signal: timeout(LINK_TIMEOUT_MS),
    })
    body = await readJson(res)
  } catch (err) {
    return { ...check, ok: false, suspect: "app", code: "injoignable", ms: Date.now() - started, detail: `blindz.app ne répond pas au lancement (${reason(err)})` }
  }
  const ms = Date.now() - started
  if (!body || typeof body !== "object") return { ...check, ok: false, suspect: "app", code: "pas_json", http: res.status, ms, detail: `réponse illisible (HTTP ${res.status})` }
  if (body.success !== true) return linkFailure(check, res, body, ms)
  const tracks = Array.isArray(body.data?.tracks) ? body.data.tracks : []
  const previews = tracks.map(t => t?.audio_url).filter(u => typeof u === "string" && u.startsWith("https://"))
  if (previews.length < MIN_TRACKS) {
    return { ...check, ok: false, suspect: "app", code: "trop_peu", http: res.status, ms, tracks: previews.length, detail: `partie lancée avec ${previews.length} extraits seulement (minimum ${MIN_TRACKS})` }
  }
  // Chaque titre doit venir du service du lien : un lien Spotify lu « a cote »
  // (repli sur une playlist Deezer du meme nom) ne prouve pas que l'import Spotify marche.
  const foreign = tracks.filter(t => t?.type !== target.provider).length
  if (foreign > 0) {
    return { ...check, ok: false, suspect: target.provider, code: "autre_service", http: res.status, ms, tracks: previews.length, detail: `${foreign} titres sur ${tracks.length} ne viennent pas de ${target.provider} : le lien n'a pas été lu par son service` }
  }
  return { ...check, ok: true, suspect: null, ms, tracks: previews.length, previews, detail: "ok" }
}

/** Debut d'un MP3 : etiquette ID3, ou synchro de trame MPEG (11 bits a 1). */
export function looksLikeMp3(bytes) {
  if (!bytes || bytes.length < 3) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

/** Les premiers octets seulement : on ne telecharge pas l'extrait entier. */
async function firstBytes(res, max) {
  if (!res.body?.getReader) return new Uint8Array(await res.arrayBuffer()).slice(0, max)
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  // Le premier morceau recu peut etre tout petit : on lit jusqu'a avoir assez.
  while (size < max) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})
  const bytes = new Uint8Array(size)
  chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
  return bytes.slice(0, max)
}

/** Lit le debut d'un extrait, comme le lecteur audio du navigateur. */
export async function checkPreview(fetchFn, url) {
  const host = safeHost(url)
  try {
    const res = await fetchFn(url, { headers: headers({ Range: "bytes=0-8191" }), signal: timeout(SHORT_TIMEOUT_MS) })
    const type = res.headers.get("content-type") ?? "type inconnu"
    if (res.status !== 200 && res.status !== 206) {
      await res.body?.cancel?.().catch(() => {})
      return { ok: false, detail: `extrait refusé, HTTP ${res.status} (${host})` }
    }
    if (!type.startsWith("audio/")) {
      await res.body?.cancel?.().catch(() => {})
      return { ok: false, detail: `l'extrait n'est pas du son (${type}, ${host})` }
    }
    if (!looksLikeMp3(await firstBytes(res, 16))) return { ok: false, detail: `l'extrait ne commence pas comme un MP3 (${host})` }
    return { ok: true, detail: `${type}, ${host}` }
  } catch (err) {
    return { ok: false, detail: `extrait injoignable (${reason(err)}, ${host})` }
  }
}

async function checkTargetOnce(fetchFn, target, mediaSrc, base) {
  const link = await checkLink(fetchFn, target, base)
  if (!link.ok) return link
  const { previews, ...rest } = link
  const blocked = previews.find(u => !allowedByCsp(u, mediaSrc, base))
  if (blocked) {
    return { ...rest, ok: false, suspect: "app", code: "csp", detail: `le navigateur refuserait l'extrait : ${safeHost(blocked)} absent de media-src (CSP de la page)` }
  }
  // Deux extraits au plus : un seul titre retire par Deezer n'est pas une panne.
  const first = await checkPreview(fetchFn, previews[0])
  if (first.ok) return { ...rest, preview: first.detail }
  const second = previews[1] ? await checkPreview(fetchFn, previews[1]) : null
  if (second?.ok) return { ...rest, preview: second.detail }
  const why = [first, second].filter(Boolean).map(r => r.detail).join(" ; ")
  return { ...rest, ok: false, suspect: "deezer", code: "extrait", detail: why }
}

/**
 * Un lien de playlist, avec un second essai apres une pause en cas d'echec :
 * un Deezer lent une seule fois ne doit pas reveiller Tym.
 */
export async function checkTarget(fetchFn, target, { mediaSrc = null, base = BASE, pauseMs = RETRY_PAUSE_MS, sleep = defaultSleep } = {}) {
  const first = await checkTargetOnce(fetchFn, target, mediaSrc, base)
  if (first.ok) return { ...first, attempts: 1 }
  await sleep(pauseMs)
  const second = await checkTargetOnce(fetchFn, target, mediaSrc, base)
  return { ...second, attempts: 2 }
}

/** Deezer en direct depuis le VPS, sans passer par blindz.app : qui est en cause ? */
export async function diagnoseDeezer(fetchFn) {
  try {
    const res = await fetchFn(DEEZER_SEARCH, { headers: headers(), signal: timeout(SHORT_TIMEOUT_MS) })
    const text = await res.text()
    const body = safeJson(text)
    // La page d'Akamai est du HTML : un titre de chanson en JSON ne compte pas.
    if (res.status === 403 || (!body && /access denied/i.test(text))) return { status: "blocked", detail: "Deezer refuse l'adresse du VPS (Access Denied)" }
    if (!res.ok || !body) return { status: "error", detail: `l'API Deezer répond HTTP ${res.status}` }
    if (body.error) return { status: "error", detail: `l'API Deezer renvoie une erreur (${body.error.type ?? "?"})` }
    if (!Array.isArray(body.data) || body.data.length === 0) return { status: "empty", detail: "la recherche Deezer ne renvoie plus aucun résultat" }
    if (!body.data.some(t => typeof t?.preview === "string" && t.preview)) return { status: "empty", detail: "la recherche Deezer renvoie des titres sans extrait" }
    return { status: "ok", detail: "Deezer répond normalement" }
  } catch (err) {
    return { status: "unreachable", detail: `l'API Deezer ne répond pas (${reason(err)})` }
  }
}

const publicFields = ({ mediaSrc, previews, provider, ...check }) => check

/**
 * La sonde complete. L'API d'abord : si elle est par terre, inutile d'attendre
 * 90 s par lien (blindz-uptime previent deja de ce cas). Les liens ensuite, un
 * par un, pour rester leger pour Deezer.
 */
export async function runProbe({ fetchFn = fetch, targets, base = BASE, pauseMs = RETRY_PAUSE_MS, sleep = defaultSleep, now = () => new Date() }) {
  const started = now()
  const api = await checkApi(fetchFn, base)
  const page = api.ok ? await checkSoloPage(fetchFn, base) : null
  const links = api.ok
    ? await targets.reduce(async (acc, target) => [...await acc, await checkTarget(fetchFn, target, { mediaSrc: page.mediaSrc, base, pauseMs, sleep })], Promise.resolve([]))
    : []
  const providerTrouble = links.some(c => !c.ok && c.suspect !== "app")
  const deezerDiagnosis = providerTrouble ? await diagnoseDeezer(fetchFn) : null
  const checks = [api, page, ...links].filter(Boolean).map(publicFields)
  return { ok: checks.every(c => c.ok), at: started.toISOString(), durationMs: now() - started, checks, deezerDiagnosis }
}
