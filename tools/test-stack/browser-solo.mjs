// Scenarios navigateur du solo : classique (puis un defi lance a un ami, joue
// par un second joueur sur les memes morceaux) et chrono. Les liens colles
// sont des liens Deezer factices : le backend de test les resout aupres du
// faux Deezer de la pile, jamais du vrai.
import { devices } from "@playwright/test"
import path from "node:path"
import { APP, judgeAudio, newPage, sleep, heardTrack } from "./probe.mjs"

const LINK = "https://www.deezer.com/fr/playlist/"

/** Joue une manche solo : ecoute, reconnait le morceau, repond selon `kind`. */
async function playSoloRound(p, kind, windows, idx) {
  const input = p.getByPlaceholder(/morceau qui tourne/i)
  await input.waitFor({ timeout: 30000 })
  const start = Date.now()
  const t = await heardTrack(p)
  if (kind === "passe") {
    // force : le lien est dans un bloc anime en continu, jamais "stable" pour
    // Playwright, alors qu'un doigt le touche sans souci.
    await p.getByRole("button", { name: /passer cette question/i }).click({ timeout: 10000, force: true })
  } else {
    await input.fill(kind === "faux" ? "rien du tout" : t?.title ?? "?")
    const artist = p.getByPlaceholder(/qui chante/i)
    if (kind === "juste") await artist.fill(t?.artist ?? "?").catch(() => {})
    await p.getByRole("button", { name: /^valider$/i }).click()
  }
  // Fin de manche : le dialogue de resultat, ou (derniere manche d'un defi)
  // directement l'ecran des resultats.
  const next = p.getByRole("button", { name: /manche suivante|terminer/i })
  await Promise.race([
    next.waitFor({ timeout: 15000 }),
    p.getByText(/résultats du défi|partie terminée/i).first().waitFor({ timeout: 15000 }),
  ]).catch(() => {})
  const revealAt = Date.now()
  windows.push({ round: idx, startAt: start, revealAt, expectedFreq: t?.freq ?? null, heard: t })
  await sleep(2600) // mesure du silence apres la revelation
  if (await next.isVisible().catch(() => false)) await next.click()
  return t
}

export async function soloCheck(browser, seed, out) {
  const label = "Solo classique, puis défi relevé par un ami"
  const problems = [], notes = [], shots = []
  const shot = async (p, name) => { const f = path.join(out, `solo-${name}.png`); await p.screenshot({ path: f }); shots.push(f) }
  const origin = new URL(APP).origin
  const perms = { permissions: ["clipboard-read", "clipboard-write"] }
  const a = await newPage(browser, { ...devices["iPhone 13"], ...perms }, "solo", problems)
  let b = null
  try {
    const p = a.page
    await a.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin })
    await p.goto(`${APP}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
    await p.getByPlaceholder(/open\.spotify\.com\/user/).first().fill(`${LINK}${seed % 40}`)
    await p.getByRole("button", { name: "5", exact: true }).first().click()
    await shot(p, "1-reglages")
    await p.getByRole("button", { name: /lancer le blind test/i }).click()
    await p.getByPlaceholder(/morceau qui tourne/i).waitFor({ timeout: 30000 })
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 2) problems.push(`l'ecran de jeu solo deborde de ${overflow} px en largeur sur telephone (defilement horizontal, carte coupee)`)

    const plan = ["juste", "proche", "passe", "faux", "juste"]
    const windows = []
    for (const [i, kind] of plan.entries()) {
      const t = await playSoloRound(p, kind, windows, i + 1)
      if (!t) problems.push(`manche ${i + 1} : aucun son entendu`)
      if (i === 0) await shot(p, "2-manche")
    }
    await p.getByText(/partie terminée/i).waitFor({ timeout: 20000 })
    await sleep(3000)
    await shot(p, "3-fin")
    const fin = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ")
    notes.push(`fin de partie : ${fin.slice(0, 120)}`)

    // Le solo pose le disque pendant ~3 s avant la musique : c'est voulu.
    const audio = judgeAudio(await p.evaluate(() => window.__probe.samples), windows, { expectSound: true, maxOnsetMs: 4500 })
    problems.push(...audio.problems)

    // Defi : le lien copie doit mener un ami sur les MEMES morceaux.
    await p.getByRole("button", { name: /défier un ami/i }).click()
    await sleep(1500)
    const copied = await p.evaluate(() => navigator.clipboard.readText()).catch(() => "")
    const code = copied.match(/code=([A-Z0-9]+)/i)?.[1]
    if (!code) throw new Error(`pas de lien de defi dans le presse-papier ("${copied.slice(0, 60)}")`)
    notes.push(`lien de defi copie : ${copied}`)
    // Le lien doit viser le site sur lequel on joue (blindz.app en prod), jamais
    // un domaine ecrit en dur.
    if (!copied.startsWith(`${APP}/challenge/`)) problems.push(`le lien de defi ne vise pas le site courant (${copied})`)
    // Le lien est aussi affiche en clair (sur iPhone la copie automatique est
    // souvent refusee) : ce doit etre le meme.
    const shown = await p.getByLabel(/lien du défi/i).inputValue({ timeout: 5000 }).catch(() => "")
    if (shown !== copied) problems.push(`le lien de defi affiche ("${shown.slice(0, 80)}") n'est pas celui copie`)
    await shot(p, "3b-defi-pret")

    b = await newPage(browser, { ...devices["iPhone 13"] }, "ami", problems)
    const q = b.page
    await q.goto(`${APP}/challenge/?code=${code}`, { waitUntil: "networkidle", timeout: 60000 })
    await q.getByPlaceholder("Ton pseudo").fill("Rival")
    await shot(q, "4-defi-accueil")
    await q.getByRole("button", { name: /jouer|relever|commencer|lancer/i }).first().click()
    const friendWindows = []
    const heardByFriend = []
    for (let i = 0; i < plan.length; i++) {
      const t = await playSoloRound(q, "juste", friendWindows, i + 1)
      heardByFriend.push(t?.k ?? null)
    }
    const same = windows.map(w => w.heard?.k ?? null)
    if (JSON.stringify(same) !== JSON.stringify(heardByFriend)) problems.push(`le defi ne rejoue pas les memes morceaux (${same.join(",")} contre ${heardByFriend.join(",")})`)
    await q.getByText(/résultats du défi/i).waitFor({ timeout: 20000 })
    await sleep(3000)
    await shot(q, "5-defi-resultats")
    const res = (await q.evaluate(() => document.body.innerText)).replace(/\s+/g, " ")
    if (!/Rival/.test(res)) problems.push("les resultats du defi n'affichent pas le joueur")
    const friendAudio = judgeAudio(await q.evaluate(() => window.__probe.samples), friendWindows, { expectSound: true, maxOnsetMs: 4500 })
    problems.push(...friendAudio.problems.map(x => `ami, ${x}`))
    return { label, ok: problems.length === 0, problems, notes, shots, audio }
  } catch (e) {
    // Premiere ligne + le locator vise : sans lui, "Timeout" ne dit pas quel geste a echoue.
    problems.push(`arret : ${e.message.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 6).join(" / ").slice(0, 400)}`)
    await a.page.screenshot({ path: path.join(out, "solo-erreur.png") }).then(() => shots.push(path.join(out, "solo-erreur.png"))).catch(() => {})
    if (b) await b.page.screenshot({ path: path.join(out, "solo-erreur-ami.png") }).then(() => shots.push(path.join(out, "solo-erreur-ami.png"))).catch(() => {})
    return { label, ok: false, problems, notes, shots }
  } finally {
    await a.ctx.close().catch(() => {})
    await b?.ctx.close().catch(() => {})
  }
}

export async function chronoCheck(browser, seed, out) {
  const label = "Solo chrono (1 minute)"
  const problems = [], notes = [], shots = []
  const shot = async (p, name) => { const f = path.join(out, `chrono-${name}.png`); await p.screenshot({ path: f }); shots.push(f) }
  const { ctx, page: p } = await newPage(browser, { ...devices["iPhone 13"] }, "chrono", problems)
  try {
    await p.goto(`${APP}/solo/`, { waitUntil: "networkidle", timeout: 60000 })
    // Onglet au sens ARIA depuis la refonte du lobby solo (role tab, plus button).
    await p.getByRole("tab", { name: /^chrono$/i }).click()
    await p.getByPlaceholder(/open\.spotify\.com\/user/).first().fill(`${LINK}${(seed + 7) % 40}`)
    await p.getByRole("button", { name: "1 min", exact: true }).click()
    await p.getByRole("button", { name: /lancer le chrono/i }).click()
    const title = p.getByPlaceholder("Titre...")
    await title.waitFor({ timeout: 30000 })
    const t0 = Date.now()
    const heard = []
    let shotDone = false
    while (Date.now() - t0 < 58000 && heard.length < 6) {
      await sleep(2200)
      const t = await heardTrack(p)
      if (!t) continue
      if (heard.at(-1)?.k === t.k) continue // encore le meme morceau : la reponse precedente n'a pas enchaine
      heard.push(t)
      await title.fill(t.title).catch(() => {})
      await p.getByPlaceholder("Artiste...").fill(t.artist).catch(() => {})
      await title.press("Enter").catch(() => {})
      if (!shotDone) { shotDone = true; await shot(p, "1-en-jeu") }
    }
    notes.push(`${heard.length} morceaux reconnus et donnes en 1 minute`)
    if (heard.length < 3) problems.push(`seulement ${heard.length} morceau(x) enchaine(s) en une minute`)
    await sleep(Math.max(0, 64000 - (Date.now() - t0)))
    await sleep(3000)
    await shot(p, "2-fin")
    const fin = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ")
    notes.push(`fin : ${fin.slice(0, 120)}`)
    return { label, ok: problems.length === 0, problems, notes, shots }
  } catch (e) {
    problems.push(`arret : ${e.message.split("\n")[0]}`)
    await shot(p, "erreur").catch(() => {})
    return { label, ok: false, problems, notes, shots }
  } finally {
    await ctx.close().catch(() => {})
  }
}
