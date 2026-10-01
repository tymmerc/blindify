// Rapport de campagne : JSON brut + page HTML, publies dans le tableau de bord
// prive (https://dev.tymmerc.eu/blindz/tests/, meme mot de passe). Aucune
// donnee de vrai joueur ici : que des bots et la base de test.
import fs from "node:fs"
import path from "node:path"

const RUN = "/opt/blindify/.test-stack"
const PUBLIC_DIR = "/opt/dev/blindz/tests"
const PUBLIC_URL = "https://dev.tymmerc.eu/blindz/tests"
const KEEP = 30         // campagnes completes (celles de la nuit)
const KEEP_PARTIAL = 10 // essais partiels (--no-browser) : ils ne chassent pas l'historique

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
const stampOf = iso => iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 13)

function audioStrip(a) {
  // Une bande par manche : fenetre attendue (debut -> revelation) et son mesure.
  if (!a?.rounds?.length) return ""
  const W = 640, rowH = 22
  const span = Math.max(...a.rounds.map(r => (r.revealAt ?? r.start) - r.start + 4000), 1)
  const x = ms => Math.round((ms / span) * (W - 120)) + 110
  const rows = a.rounds.map((r, i) => {
    const y = i * rowH + 4
    const exp = `<rect x="${x(0)}" y="${y}" width="${Math.max(2, x((r.revealAt ?? r.start) - r.start) - x(0))}" height="${rowH - 8}" fill="#ece1c8" stroke="#2e2014"/>`
    const snd = (r.sound || []).map(([s, e]) => `<rect x="${x(s)}" y="${y + 3}" width="${Math.max(1, x(e) - x(s))}" height="${rowH - 14}" fill="${r.ok ? "#7d9471" : "#c65133"}"/>`).join("")
    return `<text x="0" y="${y + 12}" font-size="11" fill="#2e2014">manche ${r.round}${r.freqOk === false ? " · mauvais morceau" : ""}</text>${exp}${snd}`
  }).join("")
  return `<svg viewBox="0 0 ${W} ${a.rounds.length * rowH + 8}" style="width:100%;max-width:${W}px" role="img" aria-label="Son mesure par manche">${rows}</svg>
  <p class="aide">Cadre beige : la manche, du début à la révélation. Barre verte : le son mesuré dans l'onglet, à la bonne fréquence.</p>`
}

function page(r, stamp) {
  const pill = ok => `<span class="pill ${ok ? "ok" : "ko"}">${ok ? "vert" : "rouge"}</span>`
  const rooms = r.rooms.map(x => `<tr><td>${pill(x.ok)}</td><td><b>${esc(x.label)}</b><div class="aide">salle ${esc(x.code ?? "?")} · ${x.stats.joueurs} joueurs · ${x.stats.manches} manches de ${x.stats.secondes} s · ${x.stats.duree_s ?? "?"} s</div>
    ${x.problems.length ? `<ul>${x.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : `<div class="aide">${x.stats.reponses_verifiees ?? 0} réponses confrontées à la base · ${esc(JSON.stringify(x.stats.verdicts ?? {}))}</div>`}</td></tr>`).join("")
  const checks = (r.browser?.checks ?? []).map(c => `<section class="carte"><h3>${pill(c.ok)} ${esc(c.label)}</h3>
    ${c.problems?.length ? `<ul>${c.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    ${c.notes?.length ? `<p class="aide">${c.notes.map(esc).join(" · ")}</p>` : ""}
    ${audioStrip(c.audio)}
    ${(c.shots ?? []).map(s => `<a href="${esc(s)}"><img src="${esc(s)}" alt="${esc(c.label)}" loading="lazy"></a>`).join("")}</section>`).join("")
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campagne ${esc(stamp)}</title><style>
:root{--papier:#f4ecdb;--carte:#ece1c8;--encre:#2e2014;--doux:#6b573f}
body{margin:0;background:var(--papier);color:var(--encre);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:20px 16px 60px}
h1{font:600 1.7rem Georgia,serif;margin:.2em 0}h2{font:600 1.2rem Georgia,serif;margin:1.6em 0 .5em}h3{margin:0 0 .5em;font-size:1rem}
.aide{color:var(--doux);font-size:13px}.pill{display:inline-block;border:1.5px solid var(--encre);border-radius:99px;padding:0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em}
.pill.ok{background:#7d9471;color:var(--encre)}.pill.ko{background:#c65133;color:var(--papier)}
table{width:100%;border-collapse:collapse;background:var(--carte);border:2px solid var(--encre)}td{padding:10px;border-top:1px solid rgba(46,32,20,.2);vertical-align:top}
.carte{background:var(--carte);border:2px solid var(--encre);border-radius:6px;padding:14px;margin:12px 0;overflow:hidden}
img{max-width:220px;border:1.5px solid var(--encre);margin:6px 6px 0 0;vertical-align:top}ul{margin:.3em 0 0;padding-left:1.2em}
.bandeau{border:2px solid var(--encre);border-radius:6px;padding:12px 14px;background:${r.ok ? "#7d9471" : "#c65133"};color:${r.ok ? "var(--encre)" : "var(--papier)"};font-weight:700}
</style></head><body><main>
<p class="aide"><a href="../">toutes les campagnes</a></p>
<h1>Campagne du ${esc(new Date(r.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))}</h1>
<div class="bandeau">${r.partial ? "Essai partiel (bots seuls, sans navigateur)." : ""} ${r.ok ? "Tout est vert." : "Au moins un scénario a échoué."} ${r.duree_s} s · graine ${r.seed} · commit ${esc((r.commit ?? "?").slice(0, 7))}</div>
<p class="aide">Pile isolée : base de test jetable, backend de test, extraits synthétiques locaux. Sorties sur Internet refusées pendant la campagne : <b>${r.egress.length}</b>${r.egress.length ? ` (${esc(r.egress[0])})` : ""}.
Fichiers non commités au moment du test (non testés, la pile tourne sur le commit) : <b>${r.non_commite ?? "?"}</b>.
Coupures réseau des bots rattrapées par une reprise : <b>${(r.reprises_reseau ?? []).length}</b>${(r.reprises_reseau ?? []).length ? ` (${esc(r.reprises_reseau[0])})` : ""}.</p>
<h2>Salles de bots</h2><table>${rooms}</table>
<h2>Navigateur</h2>${r.browser?.skipped ? '<p class="aide">Non lancé pour cette campagne.</p>' : checks}
</main></body></html>`
}

function indexPage(entries) {
  const pillOf = e => e.partial ? '<span class="pill part">partiel</span>' : `<span class="pill ${e.ok ? "ok" : "ko"}">${e.ok ? "vert" : "rouge"}</span>`
  const rowsHtml = entries.map(e => `<tr><td>${pillOf(e)}</td><td><a href="${esc(e.stamp)}/">${esc(new Date(e.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))}</a></td><td class="aide">${e.rooms} salles · ${e.duree_s} s · ${esc(e.resume)}</td></tr>`).join("")
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campagnes de tests</title>
<style>body{margin:0;background:#f4ecdb;color:#2e2014;font:15px/1.5 system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:20px 16px}h1{font:600 1.7rem Georgia,serif}
table{width:100%;border-collapse:collapse;background:#ece1c8;border:2px solid #2e2014}td{padding:9px;border-top:1px solid rgba(46,32,20,.2)}.aide{color:#6b573f;font-size:13px}
.pill{display:inline-block;border:1.5px solid #2e2014;border-radius:99px;padding:0 8px;font-size:11px;font-weight:700;text-transform:uppercase}.ok{background:#7d9471}.ko{background:#c65133;color:#f4ecdb}.part{background:#efe5d0}a{color:#2e2014}</style></head>
<body><main><p class="aide"><a href="../">tableau de bord</a></p><h1>Campagnes de tests</h1><table>${rowsHtml || '<tr><td class="aide">Aucune campagne.</td></tr>'}</table></main></body></html>`
}

export function writeReport(result) {
  const stamp = stampOf(result.date)
  const dir = path.join(PUBLIC_DIR, stamp)
  fs.mkdirSync(dir, { recursive: true })
  // Captures du navigateur : deplacees a cote de la page, liens relatifs.
  const cur = `${RUN}/reports/current`
  for (const c of result.browser?.checks ?? []) {
    c.shots = (c.shots ?? []).map(f => {
      const name = path.basename(f)
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, name))
      return name
    })
  }
  fs.rmSync(cur, { recursive: true, force: true })
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(result, null, 2))
  fs.writeFileSync(path.join(dir, "index.html"), page(result, stamp))
  // latest.json ne suit que les campagnes completes : un essai partiel vert ne
  // doit pas masquer une nuit rouge.
  if (!result.partial) fs.writeFileSync(path.join(PUBLIC_DIR, "latest.json"), JSON.stringify({ stamp, ok: result.ok, date: result.date }))

  // Index, les plus recentes d'abord. On garde 30 campagnes completes et 10
  // essais partiels ; seuls des dossiers au nom horodate sont concernes.
  const all = fs.readdirSync(PUBLIC_DIR).filter(n => /^\d{8}-\d{4}$/.test(n)).sort().reverse().map(s => {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, s, "report.json"), "utf8"))
      r.partial = Boolean(r.partial ?? r.browser?.skipped) // rapports d'avant le drapeau
      return { s, r }
    } catch { return { s, r: null } }
  })
  const full = all.filter(x => x.r && !x.r.partial), partial = all.filter(x => !x.r || x.r.partial)
  const drop = [...full.slice(KEEP), ...partial.slice(KEEP_PARTIAL)]
  for (const x of drop) fs.rmSync(path.join(PUBLIC_DIR, x.s), { recursive: true, force: true })
  const kept = all.filter(x => x.r && !drop.includes(x))
  const entries = kept.map(({ s, r }) => {
    const ko = [...r.rooms.filter(x => !x.ok).map(x => x.label), ...(r.browser?.checks ?? []).filter(c => !c.ok).map(c => c.label)]
    return { stamp: s, ok: r.ok, partial: Boolean(r.partial), date: r.date, rooms: r.rooms.length, duree_s: r.duree_s,
      resume: r.partial ? `bots seuls · ${ko.length ? `en échec : ${ko.join(", ")}` : "salles vertes"}` : ko.length ? `en échec : ${ko.join(", ")}` : "tout vert" }
  })
  fs.writeFileSync(path.join(PUBLIC_DIR, "index.html"), indexPage(entries))
  return { dir, url: `${PUBLIC_URL}/${stamp}/` }
}

/**
 * Destinataire de l'alerte : hors du depot (public), dans `.test-stack/alerte.env`
 * (ignore par git), ligne `ALERTE_DESTINATAIRE=adresse`. La variable
 * d'environnement du meme nom passe devant (essai a la main).
 */
function alertRecipient() {
  const fromEnv = process.env.ALERTE_DESTINATAIRE?.trim()
  if (fromEnv) return fromEnv
  try {
    const conf = fs.readFileSync(path.join(RUN, "alerte.env"), "utf8")
    return (conf.match(/^ALERTE_DESTINATAIRE=(.*)$/m)?.[1] ?? "").replace(/["\r]/g, "").trim() || null
  } catch {
    return null
  }
}

/** E-mail via Resend (meme cle et meme expediteur que la surveillance blindz-uptime). */
export async function sendAlert(result, url) {
  const to = alertRecipient()
  if (!to) { console.error(`alerte impossible : pas de destinataire (${path.join(RUN, "alerte.env")})`); return false }
  const env = fs.readFileSync("/opt/corsairaventure/.env.local", "utf8")
  const key = (env.match(/^RESEND_API_KEY=(.*)$/m)?.[1] ?? "").replace(/["\r]/g, "").trim()
  if (!key) { console.error("alerte impossible : pas de cle Resend"); return false }
  const ko = [
    ...result.rooms.filter(r => !r.ok).map(r => `${r.label} : ${r.problems.slice(0, 3).join(" ; ")}`),
    ...(result.browser?.checks ?? []).filter(c => !c.ok).map(c => `${c.label} : ${(c.problems ?? []).slice(0, 3).join(" ; ")}`),
    ...(result.egress.length ? [`${result.egress.length} tentative(s) de sortie sur Internet`] : []),
  ]
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Blindz Tests <contact@corsairaventure.com>",
      to: [to],
      subject: `[Blindz tests] campagne rouge (${ko.length} échec${ko.length > 1 ? "s" : ""})`,
      text: `La campagne de tests de la nuit a échoué.\n\n${ko.map(k => `- ${k}`).join("\n")}\n\nRapport complet : ${url}\n(identifiant du tableau de bord habituel)`,
    }),
  }).catch(e => ({ ok: false, status: e.message }))
  console.log(`alerte e-mail : ${res.ok ? "envoyee" : `echec ${res.status}`}`)
  return res.ok
}
