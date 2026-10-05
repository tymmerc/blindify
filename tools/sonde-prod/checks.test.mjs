// node --test tools/sonde-prod/*.test.mjs
// Aucun appel reseau : un faux fetch rejoue les reponses de blindz.app et de Deezer.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  checkApi, checkSoloPage, checkLink, checkPreview, checkTarget, diagnoseDeezer, runProbe,
  allowedByCsp, parseMediaSrc, looksLikeMp3, suspectFor, reason, USER_AGENT,
} from "./checks.mjs"
import {
  BASE, CSP, PREVIEW, DEEZER, SPOTIFY, json, tracks, quickPlayOk, quickPlayKo, audio, soloHtml, fakeFetch, prodRoutes, noSleep,
} from "./fakes.mjs"

test("API : en forme, en panne, injoignable", async () => {
  assert.equal((await checkApi(fakeFetch(prodRoutes()).fn)).ok, true)
  const down = await checkApi(fakeFetch(() => new Response("Bad Gateway", { status: 502 })).fn)
  assert.deepEqual([down.ok, down.suspect, down.http], [false, "app", 502])
  const refused = await checkApi(fakeFetch(() => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })).fn)
  assert.match(refused.detail, /ECONNREFUSED/)
})

test("page du solo : le code du solo doit etre servi, pas la landing", async () => {
  const ok = await checkSoloPage(fakeFetch(prodRoutes()).fn)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.mediaSrc, ["'self'", "data:", "blob:", "https://*.scdn.co", "https://*.dzcdn.net"])
  const landing = await checkSoloPage(fakeFetch(() => new Response("<html>landing</html>", { status: 200 })).fn)
  assert.equal(landing.ok, false)
  assert.match(landing.detail, /pas celle du solo/)
  const noChunk = await checkSoloPage(fakeFetch(url => url.endsWith("/solo/") ? new Response(soloHtml) : new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })).fn)
  assert.match(noChunk.detail, /ne se charge pas/)
})

test("CSP : lecture de media-src et domaines autorises", () => {
  const sources = parseMediaSrc(CSP)
  assert.equal(allowedByCsp(PREVIEW, sources), true)
  assert.equal(allowedByCsp("https://dzcdn.net/x.mp3", sources), false, "*.dzcdn.net ne couvre pas dzcdn.net nu")
  assert.equal(allowedByCsp("https://cdn.autre-cdn.com/x.mp3", sources), false)
  assert.equal(allowedByCsp("http://cdnt-preview.dzcdn.net/x.mp3", sources), false, "https exige")
  assert.equal(allowedByCsp(`${BASE}/x.mp3`, sources), true, "'self'")
  assert.equal(allowedByCsp("https://x.y/z.mp3", ["https:"]), true)
  assert.equal(allowedByCsp(PREVIEW, null), true, "pas de CSP, rien ne bloque")
  assert.deepEqual(parseMediaSrc("default-src 'self'"), ["'self'"])
  assert.equal(parseMediaSrc(null), null)
})

test("lancement : la requete est celle du front (origine, 10 manches, User-Agent de la sonde)", async () => {
  const { fn, calls } = fakeFetch(prodRoutes())
  const r = await checkLink(fn, DEEZER)
  assert.equal(r.ok, true)
  assert.equal(r.tracks, 10)
  const call = calls.find(c => c.url.endsWith("/api/quick-play"))
  assert.equal(call.init.method, "POST")
  assert.equal(call.init.headers.Origin, BASE)
  assert.equal(call.init.headers["User-Agent"], USER_AGENT)
  assert.deepEqual(JSON.parse(call.init.body), { url: DEEZER.url, count: 10 })
})

test("lancement refuse faute d'extraits (le 02/10) : Deezer suspect, nombre trouve note", async () => {
  const r = await checkLink(fakeFetch(prodRoutes({ quickPlay: () => quickPlayKo("insufficient_tracks", 400, { needed: 10, found: 2 }) })).fn, DEEZER)
  assert.deepEqual([r.ok, r.code, r.http, r.tracks, r.suspect], [false, "insufficient_tracks", 400, 2, "deezer"])
  assert.match(r.detail, /Pas assez de titres avec extrait audio disponible\./)
})

test("playlist introuvable : le fournisseur du lien est suspect", async () => {
  const r = await checkLink(fakeFetch(prodRoutes({ quickPlay: () => quickPlayKo("no_playlists") })).fn, SPOTIFY)
  assert.equal(r.suspect, "spotify")
  assert.equal(suspectFor("no_tracks", "deezer"), "deezer")
  assert.equal(suspectFor("insufficient_tracks", "spotify"), "deezer", "les extraits viennent de Deezer")
  assert.equal(suspectFor("quick_play_failed", "deezer"), "app")
  assert.equal(suspectFor("rate_limited", "deezer"), "app")
})

test("lancement : reponse non JSON (nginx 504) ou delai depasse, blindz.app suspect", async () => {
  const html = await checkLink(fakeFetch(() => new Response("<html>504</html>", { status: 504 })).fn, DEEZER)
  assert.deepEqual([html.ok, html.code, html.suspect, html.http], [false, "pas_json", "app", 504])
  const slow = await checkLink(fakeFetch(() => Object.assign(new Error("aborted"), { name: "TimeoutError" })).fn, DEEZER)
  assert.match(slow.detail, /délai dépassé/)
  assert.equal(reason(new Error("boum")), "boum")
})

test("lien Spotify lu par un autre service : l'import Spotify n'est pas prouve, Spotify suspect", async () => {
  const r = await checkLink(fakeFetch(prodRoutes({ quickPlay: () => quickPlayOk(10, "deezer") })).fn, SPOTIFY)
  assert.deepEqual([r.ok, r.code, r.suspect], [false, "autre_service", "spotify"])
  assert.match(r.detail, /10 titres sur 10 ne viennent pas de spotify/)
  const ok = await checkLink(fakeFetch(prodRoutes()).fn, SPOTIFY)
  assert.deepEqual([ok.ok, ok.tracks], [true, 10])
})

test("lancement accepte mais trop peu d'extraits utilisables : souci chez nous", async () => {
  const r = await checkLink(fakeFetch(prodRoutes({ quickPlay: () => json({ success: true, data: { tracks: [...tracks(3), { audio_url: null }, { audio_url: "http://x" }] } }) })).fn, DEEZER)
  assert.deepEqual([r.ok, r.code, r.tracks, r.suspect], [false, "trop_peu", 3, "app"])
})

test("extrait : du MP3, sinon la raison", async () => {
  assert.equal((await checkPreview(fakeFetch(audio).fn, PREVIEW)).ok, true)
  const forbidden = await checkPreview(fakeFetch(() => new Response("no", { status: 403 })).fn, PREVIEW)
  assert.match(forbidden.detail, /HTTP 403 \(cdnt-preview\.dzcdn\.net\)/)
  const html = await checkPreview(fakeFetch(() => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })).fn, PREVIEW)
  assert.match(html.detail, /pas du son \(text\/html/)
  const garbage = await checkPreview(fakeFetch(() => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "audio/mpeg" } })).fn, PREVIEW)
  assert.match(garbage.detail, /MP3/)
  const { fn, calls } = fakeFetch(audio)
  await checkPreview(fn, PREVIEW)
  assert.equal(calls[0].init.headers.Range, "bytes=0-8191", "seulement le debut de l'extrait")
})

test("extrait : le debut du MP3 arrive en petits morceaux", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0x49]))
      controller.enqueue(new Uint8Array([0x44, 0x33, 0x04, 0, 0]))
      controller.close()
    },
  })
  const r = await checkPreview(fakeFetch(() => new Response(body, { status: 206, headers: { "content-type": "audio/mpeg" } })).fn, PREVIEW)
  assert.equal(r.ok, true)
})

test("signature MP3 : ID3 ou synchro de trame", () => {
  assert.equal(looksLikeMp3(new Uint8Array([0x49, 0x44, 0x33])), true)
  assert.equal(looksLikeMp3(new Uint8Array([0xff, 0xfb, 0x90])), true)
  assert.equal(looksLikeMp3(new Uint8Array([0x3c, 0x68, 0x74])), false)
  assert.equal(looksLikeMp3(new Uint8Array([0xff])), false)
})

test("un lien : second essai apres la pause, et seulement en cas d'echec", async () => {
  const answers = [quickPlayKo("insufficient_tracks"), quickPlayOk(10)]
  const pauses = []
  const { fn } = fakeFetch(prodRoutes({ quickPlay: () => answers.shift() }))
  const r = await checkTarget(fn, DEEZER, { pauseMs: 60_000, sleep: async ms => { pauses.push(ms) } })
  assert.deepEqual([r.ok, r.attempts, pauses], [true, 2, [60_000]])
  const noPause = []
  const direct = await checkTarget(fakeFetch(prodRoutes()).fn, DEEZER, { sleep: async ms => { noPause.push(ms) } })
  assert.deepEqual([direct.ok, direct.attempts, noPause], [true, 1, []])
})

test("un lien : un extrait illisible sur deux passe, deux sur deux non", async () => {
  const previews = [new Response("no", { status: 404 }), audio()]
  const oneBad = await checkTarget(fakeFetch(prodRoutes({ preview: () => previews.shift() })).fn, DEEZER, { sleep: noSleep })
  assert.equal(oneBad.ok, true)
  const allBad = await checkTarget(fakeFetch(prodRoutes({ preview: () => new Response("no", { status: 404 }) })).fn, DEEZER, { sleep: noSleep })
  assert.deepEqual([allBad.ok, allBad.code, allBad.suspect, allBad.attempts], [false, "extrait", "deezer", 2])
})

test("un lien : extrait d'un domaine absent de la CSP, le navigateur ne le lirait pas", async () => {
  const other = "https://cdn.nouveau-deezer.com/x.mp3"
  const routes = prodRoutes({ quickPlay: () => json({ success: true, data: { tracks: tracks(10, other) } }) })
  const r = await checkTarget(fakeFetch(routes).fn, DEEZER, { mediaSrc: parseMediaSrc(CSP), sleep: noSleep })
  assert.deepEqual([r.ok, r.code, r.suspect], [false, "csp", "app"])
  assert.match(r.detail, /cdn\.nouveau-deezer\.com absent de media-src/)
  assert.equal(allowedByCsp("https://", parseMediaSrc(CSP)), false, "adresse illisible : refusee, sans planter")
  const broken = prodRoutes({ quickPlay: () => json({ success: true, data: { tracks: tracks(10, "https://exa mple/x.mp3") } }) })
  const odd = await checkTarget(fakeFetch(broken).fn, DEEZER, { mediaSrc: parseMediaSrc(CSP), sleep: noSleep })
  assert.deepEqual([odd.ok, odd.code], [false, "csp"])
})

test("diagnostic Deezer en direct : bloque, vide, erreur, normal, injoignable", async () => {
  const run = async res => (await diagnoseDeezer(fakeFetch(() => res).fn)).status
  assert.equal(await run(new Response("<HTML><TITLE>Access Denied</TITLE>", { status: 403 })), "blocked")
  assert.equal(await run(json({ data: [] })), "empty")
  assert.equal(await run(json({ data: [{ id: 1, preview: "" }] })), "empty")
  assert.equal(await run(json({ error: { type: "Exception", message: "Quota limit exceeded" } })), "error")
  assert.equal(await run(json({ data: [{ id: 1, preview: PREVIEW }] })), "ok")
  assert.equal(await run(json({ data: [{ id: 2, title: "Access Denied", preview: PREVIEW }] })), "ok", "un titre de chanson n'est pas un blocage")
  assert.equal(await run(new Error("getaddrinfo ENOTFOUND")), "unreachable")
})

test("sonde complete verte : 4 verifications, pas de diagnostic Deezer", async () => {
  const { fn, calls } = fakeFetch(prodRoutes())
  const r = await runProbe({ fetchFn: fn, targets: [DEEZER, SPOTIFY], sleep: noSleep })
  assert.equal(r.ok, true)
  assert.deepEqual(r.checks.map(c => c.id), ["api", "page", "deezer", "spotify"])
  assert.equal(r.deezerDiagnosis, null)
  assert.ok(!calls.some(c => c.url.startsWith("https://api.deezer.com")), "Deezer n'est appele en direct qu'en cas de panne")
  assert.ok(r.checks.every(c => !("previews" in c) && !("mediaSrc" in c)), "pas de liste d'extraits dans le rapport")
})

test("sonde complete, API par terre : on s'arrete la, sans attendre les liens", async () => {
  const { fn, calls } = fakeFetch(() => new Response("Bad Gateway", { status: 502 }))
  const r = await runProbe({ fetchFn: fn, targets: [DEEZER, SPOTIFY], sleep: noSleep })
  assert.equal(r.ok, false)
  assert.deepEqual(r.checks.map(c => c.id), ["api"])
  assert.equal(calls.length, 1)
})

test("sonde complete, panne d'extraits : retentee puis diagnostic Deezer", async () => {
  const routes = prodRoutes({
    quickPlay: body => (body.url === DEEZER.url ? quickPlayKo("insufficient_tracks", 400, { needed: 10, found: 0 }) : quickPlayOk(9, "spotify")),
    deezerSearch: () => json({ data: [] }),
  })
  const { fn, calls } = fakeFetch(routes)
  const r = await runProbe({ fetchFn: fn, targets: [DEEZER, SPOTIFY], sleep: noSleep })
  assert.equal(r.ok, false)
  assert.equal(r.checks.find(c => c.id === "deezer").attempts, 2)
  assert.equal(r.checks.find(c => c.id === "spotify").ok, true)
  assert.equal(r.deezerDiagnosis.status, "empty")
  assert.equal(calls.filter(c => c.url.endsWith("/api/quick-play")).length, 3)
})
