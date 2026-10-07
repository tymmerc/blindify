// node --test tools/sonde-prod/*.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { cause, composeMail, formatLogLine, formatDuration, parisTime } from "./message.mjs"

const AT = "2026-10-05T10:15:00.000Z" // 12:15 a Paris
const api = { id: "api", label: "API (/api/health)", ok: true, suspect: null, detail: "ok" }
const page = { id: "page", label: "Page du solo (/solo/)", ok: true, suspect: null, detail: "ok" }
const deezerOk = { id: "deezer", provider: "deezer", label: "Deezer, playlist Top France", url: "https://www.deezer.com/fr/playlist/1109890291", ok: true, suspect: null, tracks: 10, ms: 5123, attempts: 1, detail: "ok" }
const spotifyOk = { id: "spotify", provider: "spotify", label: "Spotify, playlist test", url: "https://open.spotify.com/playlist/6QfyfBMAoQy8YxbbPL0hkZ", ok: true, suspect: null, tracks: 9, ms: 7300, attempts: 1, detail: "ok" }
const deezerNoPreview = {
  ...deezerOk, ok: false, suspect: "deezer", code: "insufficient_tracks", http: 400, tracks: 2, attempts: 2,
  detail: "HTTP 400 insufficient_tracks « Pas assez de titres avec extrait audio disponible. » (2 titres jouables)",
}
const run = (checks, deezerDiagnosis = null) => ({ ok: checks.every(c => c.ok), at: AT, durationMs: 74_600, checks, deezerDiagnosis })
const EM_DASH = String.fromCharCode(0x2014)

test("heure de Paris et durees lisibles", () => {
  assert.equal(parisTime(AT), "05/10 à 12:15")
  assert.equal(parisTime("2026-12-01T23:30:00Z"), "02/12 à 00:30", "heure d'hiver, changement de jour")
  assert.equal(formatDuration(45 * 60_000), "45 min")
  assert.equal(formatDuration(125 * 60_000), "2 h 05")
  assert.equal(formatDuration(-5), "0 min")
})

test("cause : un echec cote blindz.app passe avant tout", () => {
  const broken = { ...page, ok: false, suspect: "app", detail: "HTTP 502" }
  const c = cause(run([api, broken, deezerNoPreview], { status: "empty", detail: "x" }))
  assert.equal(c.side, "app")
  assert.match(c.text, /chez nous/)
  assert.match(c.text, /HTTP 502/)
})

test("cause : Deezer bloque l'adresse du VPS", () => {
  const c = cause(run([api, page, deezerNoPreview], { status: "blocked", detail: "Deezer refuse l'adresse du VPS (Access Denied)" }))
  assert.equal(c.side, "deezer")
  assert.match(c.text, /Akamai/)
})

test("cause : la recherche Deezer ne renvoie plus rien en direct", () => {
  const c = cause(run([api, page, deezerNoPreview, spotifyOk], { status: "empty", detail: "la recherche Deezer ne renvoie plus aucun résultat" }))
  assert.equal(c.side, "deezer")
  assert.match(c.text, /en direct depuis le VPS, la recherche Deezer ne renvoie plus aucun résultat/)
})

test("cause : Deezer va bien en direct mais l'app ne trouve plus d'extraits (cas du 02/10)", () => {
  const c = cause(run([api, page, deezerNoPreview], { status: "ok", detail: "Deezer répond normalement" }))
  assert.equal(c.side, "app")
  assert.match(c.text, /02\/10/)
})

test("cause : seule la playlist Spotify casse", () => {
  const spotifyKo = { ...spotifyOk, ok: false, suspect: "spotify", code: "no_tracks", detail: "HTTP 400 no_tracks" }
  const c = cause(run([api, page, deezerOk, spotifyKo], { status: "ok", detail: "Deezer répond normalement" }))
  assert.equal(c.side, "spotify")
})

test("cause : seule la playlist Spotify manque d'extraits, Deezer passe : la playlist Spotify, pas notre recherche", () => {
  const spotifyNoPreview = { ...spotifyOk, ok: false, suspect: "deezer", code: "insufficient_tracks", http: 400, tracks: 3, attempts: 2, detail: "HTTP 400 insufficient_tracks (3 titres jouables)" }
  const c = cause(run([api, page, deezerOk, spotifyNoPreview], { status: "ok", detail: "Deezer répond normalement" }))
  assert.equal(c.side, "spotify")
  assert.match(c.text, /playlist Spotify qui a changé/)
  assert.match(c.text, /targets\.mjs/)
  assert.doesNotMatch(c.text, /deezerPreviewService/)
  const both = cause(run([api, page, deezerNoPreview, spotifyNoPreview], { status: "ok", detail: "Deezer répond normalement" }))
  assert.match(both.text, /deezerPreviewService/, "les deux en manque : c'est bien notre recherche")
})

test("cause : la playlist Deezer de la sonde a disparu, Deezer va bien", () => {
  const gone = { ...deezerOk, ok: false, suspect: "deezer", code: "no_playlists", http: 400, detail: "HTTP 400 no_playlists" }
  const c = cause(run([api, page, gone], { status: "ok", detail: "Deezer répond normalement" }))
  assert.equal(c.side, "deezer")
  assert.match(c.text, /targets\.mjs/)
})

test("cause : seuls les extraits ne se lisent pas depuis le VPS", () => {
  const cdn = { ...deezerOk, ok: false, suspect: "deezer", code: "extrait", detail: "extrait refusé, HTTP 403 (cdnt-preview.dzcdn.net)" }
  const c = cause(run([api, page, cdn], { status: "ok", detail: "Deezer répond normalement" }))
  assert.equal(c.side, "deezer")
  assert.match(c.text, /CDN de Deezer/)
})

test("cause : echecs melanges, pas de certitude", () => {
  const gone = { ...deezerOk, ok: false, suspect: "deezer", code: "no_playlists", detail: "x" }
  const cdn = { ...spotifyOk, ok: false, suspect: "deezer", code: "extrait", detail: "y" }
  const c = cause(run([api, page, gone, cdn], { status: "ok", detail: "ok" }))
  assert.deepEqual([c.side, /sans certitude/.test(c.text)], ["inconnu", true])
})

test("cause : rien en echec", () => {
  assert.equal(cause(run([api, page, deezerOk])).side, "aucun")
})

test("e-mail de panne : quoi, pourquoi, comment rejouer", () => {
  const r = run([api, page, deezerNoPreview, spotifyOk], { status: "empty", detail: "la recherche Deezer ne renvoie plus aucun résultat" })
  const mail = composeMail("panne", r, null)
  assert.equal(mail.subject, "[Blindz] Le solo par lien ne marche plus sur blindz.app")
  assert.match(mail.text, /le 05\/10 à 12:15\)\. Ce qui est en échec ci-dessous a raté deux fois, à une minute d'écart\./)
  assert.match(mail.text, /Ça ressemble à Deezer/)
  assert.match(mail.text, /- Deezer, playlist Top France : en échec, HTTP 400 insufficient_tracks/)
  assert.match(mail.text, /- Spotify, playlist test : ok, 9 titres jouables en 7\.3 s/)
  assert.match(mail.text, /curl -s -X POST https:\/\/blindz\.app\/api\/quick-play .*"url":"https:\/\/www\.deezer\.com\/fr\/playlist\/1109890291","count":10/)
  assert.match(mail.text, /environ toutes les 6 h/)
})

test("e-mail de rappel : depuis quand", () => {
  const r = run([api, page, deezerNoPreview], { status: "empty", detail: "x" })
  const mail = composeMail("rappel", r, { downSince: "2026-10-05T04:00:00.000Z" })
  assert.equal(mail.subject, "[Blindz] Le solo par lien est toujours en panne (depuis 6 h 15)")
  assert.match(mail.text, /première sonde en échec le 05\/10 à 06:00/)
  assert.match(mail.text, /Prochain rappel dans 6 h environ/)
})

test("e-mail de retour : c'est reparti, et la duree de la panne", () => {
  const mail = composeMail("retour", run([api, page, deezerOk, spotifyOk]), { downSince: "2026-10-05T08:05:00.000Z" })
  assert.equal(mail.subject, "[Blindz] C'est reparti : le solo par lien remarche")
  assert.match(mail.text, /environ 2 h 10/)
  assert.match(mail.text, /- Deezer, playlist Top France : ok, 10 titres jouables en 5\.1 s/)
})

test("e-mail : retour sans debut connu, sans phrase de duree", () => {
  const mail = composeMail("retour", run([api, page, deezerOk]), { downSince: null })
  assert.doesNotMatch(mail.text, /a duré/)
})

test("API par terre : la commande a rejouer est le health", () => {
  const down = { ...api, ok: false, suspect: "app", code: "injoignable", detail: "blindz.app ne répond pas (ECONNREFUSED)" }
  const mail = composeMail("panne", run([down]), null)
  assert.match(mail.text, /curl -s https:\/\/blindz\.app\/api\/health/)
  assert.match(mail.text, /chez nous/)
})

test("jamais de tiret cadratin dans les e-mails", () => {
  const r = run([api, page, deezerNoPreview, spotifyOk], { status: "ok", detail: "Deezer répond normalement" })
  for (const type of ["panne", "rappel", "retour"]) {
    const mail = composeMail(type, r, { downSince: "2026-10-05T04:00:00.000Z" })
    assert.ok(!mail.subject.includes(EM_DASH) && !mail.text.includes(EM_DASH), type)
  }
})

test("ligne du journal : compacte, sans adresse ni secret", () => {
  const r = run([api, page, deezerNoPreview, { ...spotifyOk, attempts: 2 }], { status: "empty", detail: "x" })
  const line = formatLogLine(r, { announced: "KO" }, "panne:envoye")
  assert.equal(
    line,
    "2026-10-05T10:15:00Z etat=KO annonce=KO api=ok page=ok deezer=KO[insufficient_tracks;HTTP 400;2 titres;suspect=deezer] spotify=ok[9 titres;7.3s;2e essai] cause=deezer deezer_direct=empty mail=panne:envoye duree=75s",
  )
  assert.doesNotMatch(line, /@/)
})

test("ligne du journal : API ou page passees au 2e essai", () => {
  const line = formatLogLine(run([{ ...api, attempts: 2 }, { ...page, attempts: 1 }]), { announced: "OK" }, "aucun")
  assert.match(line, / api=ok\[2e essai\] page=ok /)
})

test("ligne du journal d'une sonde verte", () => {
  const line = formatLogLine(run([api, page, deezerOk, spotifyOk]), { announced: "OK" }, "aucun")
  assert.equal(line, "2026-10-05T10:15:00Z etat=OK annonce=OK api=ok page=ok deezer=ok[10 titres;5.1s] spotify=ok[9 titres;7.3s] mail=aucun duree=75s")
})
