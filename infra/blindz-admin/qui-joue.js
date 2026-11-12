/* Onglet « Qui joue » de l'administration Blindz (T29) : un carnet de soirées.
 *
 * Deux sources, toutes deux derrière le mot de passe de l'administration :
 *   - data.json (tools/stats.sql, base de prod en lecture seule) : parties,
 *     participations, joueurs sans pseudo, avis ;
 *   - visites/arrivees.json (infra/visites/arrivees.py, journaux nginx) :
 *     d'où arrivent les visiteurs, en comptes par jour et par salle, sans
 *     aucune adresse.
 *
 * Tout est en heure de Paris. Un « jour de jeu » va de 6 h à 6 h : une soirée
 * qui finit à 3 h compte pour la veille (même règle que arrivees.py).
 * Les pseudos ne s'affichent jamais : J1, J2… dans l'ordre d'arrivée de la
 * soirée, pour suivre un joueur d'une partie à l'autre.
 *
 * Les calculs sont des fonctions pures, testées par qui-joue.test.mjs ; le
 * rendu ne fait qu'écrire du HTML échappé.
 */
(function (racine) {
  "use strict";

  const DEBUT_JOUR_H = 6;
  const BLOQUEE_APRES_MS = 3 * 3600 * 1000;
  // Au-delà, la fin enregistrée est celle du ménage du lendemain, pas du jeu.
  const DUREE_MAX_S = 4 * 3600;
  const SERIE_MIN = 3; // parties de suite dans la même salle regroupées
  const MODES = { solo: "solo", defi: "défi", chrono: "chrono", buzzer: "un seul tel", friends: "à distance",
    event: "autour d'une table", site: "lien du site", streamer: "streamer" };
  const SOURCES = { invitation: "lien d'invitation", discord_activite: "activité Discord", discord_lien: "lien Discord",
    google: "Google", bing: "Bing", moteur: "autre moteur", site: "autre site", interne: "depuis blindz.app",
    direct: "direct" };
  const ORDRE_SOURCES = ["google", "bing", "moteur", "invitation", "discord_activite", "discord_lien", "site", "interne", "direct"];

  const PARIS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  /* Horloge de Paris d'un instant UTC ("2026-11-07T21:40:00", sans Z en base). */
  function paris(iso) {
    const t = typeof iso === "number" ? iso : Date.parse(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
    const p = Object.fromEntries(PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { an: +p.year, mois: +p.month, jour: +p.day, h: +p.hour, min: +p.minute };
  }

  /* Jour de jeu : date de Paris, l'horloge reculée de 6 h (comme arrivees.py). */
  function jourDeJeu(iso) {
    const p = paris(iso);
    const d = new Date(Date.UTC(p.an, p.mois - 1, p.jour, p.h - DEBUT_JOUR_H, p.min));
    return d.toISOString().slice(0, 10);
  }

  function heure(iso) {
    const p = paris(iso);
    return `${p.h}h${String(p.min).padStart(2, "0")}`;
  }

  function decaler(jour, n) {
    const d = new Date(jour + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* État lisible d'une partie : finie, écourtée, bloquée, abandonnée, en cours. */
  function etat(s, maintenant) {
    const ou = s.manches ? ` à la manche ${s.jouees}/${s.manches}` : "";
    if (s.etat === "finished") return s.manches && s.jouees < s.manches ? { code: "ecourtee", texte: "finie avant la fin" + ou } : { code: "finie", texte: "finie" };
    if (s.etat === "abandoned") return { code: "abandon", texte: "abandonnée" + ou };
    const vieille = maintenant - Date.parse(s.debut + "Z") > BLOQUEE_APRES_MS;
    if (vieille) return { code: "bloquee", texte: "bloquée" + ou };
    return { code: "en_cours", texte: "en cours" + ou };
  }

  function ajouter(dico, cle, n) { return { ...dico, [cle]: (dico[cle] || 0) + n }; }

  /* Première partie de chaque joueur (hors orphelines) : sert à « nouveau ». */
  function premieresParties(sessions, participations) {
    const debutDe = new Map(sessions.filter((s) => !s.orpheline).map((s) => [s.id, s.debut]));
    const premiere = new Map();
    for (const p of participations) {
      const d = debutDe.get(p.s);
      if (d && (!premiere.has(p.u) || d < premiere.get(p.u))) premiere.set(p.u, d);
    }
    return premiere;
  }

  /* Le carnet : une soirée par jour de jeu, la plus récente d'abord. */
  function construire(D, A, options) {
    const opts = { tests: false, maintenant: Date.now(), ...options };
    const sessions = (D.sessions || []).filter((s) => !s.orpheline && s.debut);
    const participations = D.participations || [];
    const infos = new Map((D.joueurs_infos || []).map((j) => [j.u, j]));
    const premiere = premieresParties(sessions, participations);
    const parSession = new Map();
    for (const p of participations) parSession.set(p.s, [...(parSession.get(p.s) || []), p]);
    const jours = (A && A.jours) || {};
    const salles = (A && A.salles) || {};
    const soirees = new Map();
    const soiree = (jour) => {
      if (!soirees.has(jour)) {
        soirees.set(jour, { jour, parties: [], tests: 0, joueurs: new Map(), avis: [], visites: jours[jour] || null });
      }
      return soirees.get(jour);
    };

    for (const s of [...sessions].sort((a, b) => (a.debut < b.debut ? -1 : 1))) {
      const so = soiree(jourDeJeu(s.debut));
      if (s.test && !opts.tests) { so.tests += 1; continue; }
      const joueurs = [...(parSession.get(s.id) || [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const lignes = joueurs.map((p) => {
        if (!so.joueurs.has(p.u)) {
          const info = infos.get(p.u) || {};
          const premier = premiere.get(p.u);
          so.joueurs.set(p.u, { u: p.u, n: `J${so.joueurs.size + 1}`, parties: 0, liens: info.liens || 0,
            nouveau: Boolean(premier) && jourDeJeu(premier) === so.jour, test: Boolean(info.test) });
        }
        const j = so.joueurs.get(p.u);
        j.parties += 1;
        return { nom: j.n, score: p.score ?? 0 };
      });
      let sources = s.salle ? { ...(salles[`${so.jour}|${s.salle}`] || {}) } : {};
      if (s.discord && !sources.discord_activite) sources = ajouter(sources, "discord_activite", 1);
      so.parties.push({ id: s.id, mode: MODES[s.mode] || s.mode, debut: s.debut, heure: heure(s.debut),
        salle: s.salle || null, duree_s: s.duree_s != null && s.duree_s > DUREE_MAX_S ? null : s.duree_s,
        fin_menage: s.duree_s != null && s.duree_s > DUREE_MAX_S, manches: s.manches, jouees: s.jouees, etat: etat(s, opts.maintenant),
        joueurs: lignes, sources, test: Boolean(s.test), avis: [] });
    }
    for (const jour of Object.keys(jours)) soiree(jour);

    for (const a of D.avis || []) {
      if (a.test && !opts.tests) continue;
      const so = soiree(jourDeJeu(a.le));
      const partie = so.parties.find((p) => p.id === a.s);
      const avis = { type: a.type, reponse: a.reponse, message: a.message, contact: a.contact, heure: heure(a.le) };
      if (partie) partie.avis.push(avis); else so.avis.push(avis);
    }

    return [...soirees.values()].map((so) => ({
      ...so,
      debut: so.parties.length ? so.parties[0].heure : null,
      fin: so.parties.length ? finDe(so.parties[so.parties.length - 1]) : null,
      nouveaux: [...so.joueurs.values()].filter((j) => j.nouveau).length,
      joueurs: [...so.joueurs.values()],
    })).sort((a, b) => (a.jour < b.jour ? 1 : -1));
  }

  /* Parties de suite dans la même salle et le même mode, en séries. */
  function grouper(parties) {
    const groupes = [];
    for (const p of parties) {
      const dernier = groupes[groupes.length - 1];
      if (dernier && p.salle && dernier[0].salle === p.salle && dernier[0].mode === p.mode) dernier.push(p);
      else groupes.push([p]);
    }
    return groupes.flatMap((g) => (g.length >= SERIE_MIN ? [{ serie: g }] : g.map((p) => ({ partie: p }))));
  }

  function finDe(p) {
    const t = Date.parse(p.debut + "Z") + (p.duree_s || 0) * 1000;
    return heure(t);
  }

  /* Totaux sur les n derniers jours de jeu (1 = aujourd'hui). */
  function totaux(soirees, n, aujourdhui) {
    const depuis = decaler(aujourdhui, -(n - 1));
    const dans = soirees.filter((s) => s.jour >= depuis && s.jour <= aujourdhui);
    const vus = new Set(dans.flatMap((s) => s.joueurs.map((j) => j.u)));
    const nouveaux = new Set(dans.flatMap((s) => s.joueurs.filter((j) => j.nouveau).map((j) => j.u)));
    const somme = (f) => dans.reduce((n, s) => n + f(s), 0);
    return {
      parties: somme((s) => s.parties.length),
      tests: somme((s) => s.tests),
      joueurs: vus.size,
      nouveaux: nouveaux.size,
      visites: somme((s) => (s.visites ? s.visites.visites : 0)),
      ont_joue: somme((s) => (s.visites ? s.visites.ont_joue : 0)),
      sans_jouer: somme((s) => (s.visites ? s.visites.importe_sans_jouer : 0)),
    };
  }

  /* ============================== rendu ============================== */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const JOURS_SEM = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  function dateCourte(jour) {
    const d = new Date(jour + "T12:00:00Z");
    return `${JOURS_SEM[d.getUTCDay()]} ${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
  }
  const duree = (s) => (s == null ? "" : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
  const dureeDe = (p) => (p.fin_menage ? "fin non enregistrée" : duree(p.duree_s));

  function ligneSources(sources, unite) {
    const cles = ORDRE_SOURCES.filter((k) => sources[k]);
    if (!cles.length) return "";
    return cles.map((k) => `${esc(SOURCES[k])} <b class="num">${sources[k]}</b>`).join(" · ") + (unite ? ` <span class="qj-u">${unite}</span>` : "");
  }

  const APPAREILS = { telephone: "téléphone", ordinateur: "ordinateur", tablette: "tablette" };
  /* Pages d'arrivée (les 4 premières), sites d'origine, appareils. */
  function lignePages(v) {
    const top = (dico, n, nom) => Object.entries(dico || {}).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, c]) => `${esc(nom ? nom(k) : k)} <b class="num">${c}</b>`).join(" · ");
    const pages = top(v.pages, 4, (k) => (k === "inconnue" ? "page déjà ouverte" : k));
    const sites = top(v.sites, 3);
    const app = top(v.appareils, 3, (k) => APPAREILS[k] || k);
    return [pages && `<span class="qj-u">arrivée sur</span> ${pages}`, sites && `<span class="qj-u">venus de</span> ${sites}`, app]
      .filter(Boolean).join(` <span class="qj-u">/</span> `);
  }

  function rendreAvis(a) {
    const quoi = a.type === "bug" ? "bug signalé" : a.type === "mot" ? "message" : a.reponse === "oui" ? "avis : oui" : "avis : pas trop";
    const cl = a.type === "bug" ? "ko" : a.reponse === "oui" || a.type === "mot" ? "ok" : "moyen";
    return `<li class="qj-avis"><span class="qj-pastille ${cl}">${esc(quoi)}</span>${a.message ? ` « ${esc(a.message)} »` : ""}${a.contact ? ' <span class="qj-u">contact laissé</span>' : ""} <span class="qj-u">${esc(a.heure)}</span></li>`;
  }

  function rendrePartie(p) {
    const scores = p.joueurs.map((j) => `${esc(j.nom)} <b class="num">${j.score}</b>`).join(" · ");
    const src = ligneSources(p.sources);
    const alerte = p.etat.code === "finie" ? "" : ` <span class="qj-etat ${p.etat.code}">${esc(p.etat.texte)}</span>`;
    return `<details class="qj-partie"><summary>
        <span class="qj-h num">${esc(p.heure)}</span>
        <span class="qj-mode">${esc(p.mode)}${p.test ? ' <span class="qj-u">test</span>' : ""}${alerte}</span>
        <span class="qj-resume num">${p.joueurs.length} j.${p.duree_s != null ? " · " + esc(duree(p.duree_s)) : ""}</span>
      </summary>
      <div class="qj-detail">
        <p>${p.manches ? `${p.jouees}/${p.manches} manches · ` : ""}${esc(dureeDe(p)) || "durée inconnue"} · partie ${p.id}</p>
        ${scores ? `<p>${scores}</p>` : '<p class="qj-u">aucun joueur enregistré</p>'}
        <p>${src ? "Arrivés par " + src : '<span class="qj-u">source inconnue (code absent des journaux)</span>'}</p>
        ${p.avis.length ? `<ul>${p.avis.map(rendreAvis).join("")}</ul>` : ""}
      </div></details>`;
  }

  function rendreSerie(parties) {
    const premiere = parties[0];
    const derniere = parties[parties.length - 1];
    const alertes = parties.filter((p) => p.etat.code !== "finie").length;
    const nbJoueurs = Math.max(...parties.map((p) => p.joueurs.length));
    return `<details class="qj-partie qj-serie"><summary>
        <span class="qj-h num">${esc(premiere.heure)}</span>
        <span class="qj-mode">${esc(premiere.mode)} <span class="qj-u">${parties.length} parties de suite jusqu'à ${esc(derniere.heure)}</span>${alertes ? ` <span class="qj-etat bloquee">${alertes} pas finie${alertes > 1 ? "s" : ""}</span>` : ""}</span>
        <span class="qj-resume num">${nbJoueurs} j.</span>
      </summary>
      <div class="qj-serie-liste">${parties.map(rendrePartie).join("")}</div></details>`;
  }

  function rendreSoiree(s) {
    const v = s.visites;
    const n = s.parties.length;
    const joueurs = s.joueurs.length;
    const titre = n
      ? `${n} partie${n > 1 ? "s" : ""} · ${joueurs} joueur${joueurs > 1 ? "s" : ""}${s.nouveaux ? ` dont ${s.nouveaux} nouveau${s.nouveaux > 1 ? "x" : ""}` : ""}`
      : "personne n'a joué en salle";
    const habitues = s.joueurs.filter((j) => !j.nouveau).length;
    const playlists = s.joueurs.filter((j) => j.liens > 0).length;
    const lignesV = v ? [
      ligneSources(v.sources, "visites"),
      [`<b class="num">${v.ont_joue}</b> ont joué`, v.importe_sans_jouer ? `<b class="num">${v.importe_sans_jouer}</b> ont importé sans jouer` : "",
        v.solo ? `<b class="num">${v.solo}</b> solo par lien` : "", v.imports_ko ? `<span class="qj-etat bloquee">${v.imports_ko} import${v.imports_ko > 1 ? "s" : ""} raté${v.imports_ko > 1 ? "s" : ""}</span>` : ""]
        .filter(Boolean).join(" · "),
      lignePages(v),
    ].filter(Boolean) : [];
    return `<section class="qj-soiree">
      <header><h2>${esc(dateCourte(s.jour))}${s.debut ? ` <span class="qj-plage num">${esc(s.debut)} → ${esc(s.fin)}</span>` : ""}</h2>
        <p class="qj-titre">${titre}</p>
        ${joueurs ? `<p class="qj-u">${habitues} habitué${habitues > 1 ? "s" : ""} · ${playlists} avec une playlist importée${s.tests ? ` · ${s.tests} partie${s.tests > 1 ? "s" : ""} de test à part` : ""}</p>` : s.tests ? `<p class="qj-u">${s.tests} partie${s.tests > 1 ? "s" : ""} de test à part</p>` : ""}
        ${lignesV.map((l) => `<p class="qj-v">${l}</p>`).join("")}
      </header>
      ${grouper(s.parties).map((g) => (g.partie ? rendrePartie(g.partie) : rendreSerie(g.serie))).join("")}
      ${s.avis.length ? `<ul class="qj-avis-soiree">${s.avis.map(rendreAvis).join("")}</ul>` : ""}
    </section>`;
  }

  function rendreTotaux(soirees, aujourdhui) {
    const cols = [["aujourd'hui", 1], ["7 jours", 7], ["30 jours", 30]].map(([l, n]) => [l, totaux(soirees, n, aujourdhui)]);
    const ligne = (lib, cle, aide) => `<tr><th scope="row">${lib}${aide ? ` <span class="qj-u">${aide}</span>` : ""}</th>${cols.map(([, t]) => `<td class="num">${t[cle]}</td>`).join("")}</tr>`;
    const tests = cols[2][1].tests;
    return `<table class="qj-totaux"><thead><tr><th></th>${cols.map(([l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead><tbody>
      ${ligne("parties", "parties")}${ligne("joueurs", "joueurs")}${ligne("nouveaux", "nouveaux")}
      ${ligne("visites", "visites", "journaux")}${ligne("ont joué", "ont_joue", "visites")}${ligne("importé sans jouer", "sans_jouer")}
      </tbody></table>${tests ? `<p class="qj-u">${tests} partie${tests > 1 ? "s" : ""} de test écartée${tests > 1 ? "s" : ""} sur 30 jours</p>` : ""}`;
  }

  const etatEcran = { D: null, A: null, erreurA: null, tests: false, nb: 10 };

  function afficher() {
    const hote = typeof document !== "undefined" && document.getElementById("qui-joue");
    if (!hote || !etatEcran.D) return;
    const soirees = construire(etatEcran.D, etatEcran.A, { tests: etatEcran.tests });
    const aujourdhui = jourDeJeu(Date.now());
    const A = etatEcran.A;
    const couverture = A
      ? `Arrivées lues dans les journaux du ${esc(dateCourte(jourDeJeu(A.journaux_du)))} au ${esc(dateCourte(jourDeJeu(A.journaux_au)))}, gardées ensuite en comptes. Tes propres visites y sont.`
      : `Arrivées indisponibles${etatEcran.erreurA ? " : " + esc(etatEcran.erreurA) : ""}.`;
    const visibles = soirees.slice(0, etatEcran.nb);
    hote.innerHTML = `<div class="qj">
      <div class="qj-haut">
        ${rendreTotaux(soirees, aujourdhui)}
        <label class="bascule"><input type="checkbox" id="qj-tests"${etatEcran.tests ? " checked" : ""}> montrer les parties de test</label>
        <p class="qj-u">Heure de Paris, une soirée va de 6 h à 6 h. ${couverture} Joueurs sans pseudo : J1, J2… dans l'ordre d'arrivée de la soirée. « Nouveau » = première partie de ce compte : tant que la correction des invités (T26) n'est pas en prod, un joueur qui revient un autre jour reçoit souvent un compte neuf et passe pour nouveau.</p>
      </div>
      ${visibles.map(rendreSoiree).join("")}
      ${soirees.length > visibles.length ? `<button class="qj-plus" id="qj-plus">soirées plus anciennes (${soirees.length - visibles.length})</button>` : ""}
    </div>`;
    document.getElementById("qj-tests").onchange = (e) => { etatEcran.tests = e.target.checked; afficher(); };
    const plus = document.getElementById("qj-plus");
    if (plus) plus.onclick = () => { etatEcran.nb += 14; afficher(); };
  }

  async function chargerArrivees() {
    try {
      const r = await fetch("visites/arrivees.json?t=" + Date.now());
      if (!r.ok) throw new Error(`visites/arrivees.json introuvable (${r.status})`);
      etatEcran.A = await r.json();
      etatEcran.erreurA = null;
    } catch (e) {
      etatEcran.A = null;
      etatEcran.erreurA = e.message;
    }
    afficher();
  }

  function donnees(D) {
    etatEcran.D = D;
    afficher();
  }

  const api = { jourDeJeu, heure, etat, construire, grouper, totaux, donnees, afficher, chargerArrivees, rendreSoiree };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.QuiJoue = api;
})(this);
