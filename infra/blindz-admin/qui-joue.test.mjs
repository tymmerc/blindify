// Tests de qui-joue.js (onglet « Qui joue » de l'administration, T29).
// Usage : node --test infra/blindz-admin/qui-joue.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const Q = createRequire(import.meta.url)("./qui-joue.js");

// Samedi 07/11 : 101 vraie (Alice nouvelle, Bob déjà venu le 01/11), 102 de
// test, 103 bloquée vers 3 h du matin (même soirée), 104 la veille de Bob.
const D = {
  sessions: [
    { id: 90, mode: "friends", etat: "finished", debut: "2026-11-01T20:00:00", duree_s: 600, manches: 10, jouees: 10, salle: "OLD111", test: false, orpheline: false },
    { id: 101, mode: "event", etat: "finished", debut: "2026-11-07T20:40:00", duree_s: 1080, manches: 20, jouees: 20, salle: "ABC123", test: false, orpheline: false, discord: false },
    { id: 102, mode: "friends", etat: "finished", debut: "2026-11-07T21:00:00", duree_s: 300, manches: 5, jouees: 5, salle: "TST999", test: true, orpheline: false },
    { id: 103, mode: "friends", etat: "in_progress", debut: "2026-11-08T02:00:00", duree_s: null, manches: 10, jouees: 7, salle: "ZTPW4R", test: false, orpheline: false, discord: true },
    { id: 50, mode: "friends", etat: "finished", debut: "2026-08-01T20:00:00", test: false, orpheline: true },
  ],
  participations: [
    { s: 90, u: 2, score: 5 },
    { s: 101, u: 1, score: 14 }, { s: 101, u: 2, score: 20 },
    { s: 102, u: 7, score: 0 },
    { s: 103, u: 1, score: 3 },
  ],
  joueurs_infos: [
    { u: 1, liens: 2, test: false }, { u: 2, liens: 0, test: false }, { u: 7, liens: 0, test: true },
  ],
  avis: [
    { type: "avis", reponse: "oui", message: "<b>trop</b> bien", s: 101, le: "2026-11-07T21:00:00", contact: true, test: false },
    { type: "avis", reponse: "pas_trop", message: null, s: 102, le: "2026-11-07T21:06:00", contact: false, test: true },
  ],
  hote: "NePasAfficher",
};
const A = {
  journaux_du: "2026-10-25T00:00:00Z", journaux_au: "2026-11-08T17:00:00Z",
  jours: { "2026-11-07": { visites: 9, ont_joue: 4, importe_sans_jouer: 1, solo: 0, imports_ko: 2, sources: { google: 3, invitation: 6 },
             pages: { "/blind-test-spotify/": 3, inconnue: 2, "/<x>/": 1 }, sites: { "forum-exemple": 1 }, appareils: { telephone: 7, ordinateur: 2 } },
           "2026-11-03": { visites: 2, ont_joue: 0, importe_sans_jouer: 0, solo: 0, imports_ko: 0, sources: { direct: 2 } } },
  salles: { "2026-11-07|ABC123": { google: 1, invitation: 2 }, "2026-11-06|ABC123": { direct: 9 } },
};
const MAINTENANT = Date.parse("2026-11-08T17:00:00Z");

test("jour de jeu : de 6 h à 6 h, heure de Paris, été comme hiver", () => {
  assert.equal(Q.jourDeJeu("2026-11-08T02:00:00"), "2026-11-07"); // 3 h à Paris
  assert.equal(Q.jourDeJeu("2026-11-08T05:00:00"), "2026-11-08"); // 6 h à Paris
  assert.equal(Q.jourDeJeu("2026-07-15T04:30:00"), "2026-07-15"); // 6 h 30 l'été
  assert.equal(Q.jourDeJeu("2026-07-15T03:30:00"), "2026-07-14");
  assert.equal(Q.heure("2026-11-07T20:40:00"), "21h40");
});

test("état : finie, écourtée, abandonnée, bloquée, en cours", () => {
  const s = (etat, debut, jouees = 10) => Q.etat({ etat, debut, manches: 10, jouees }, MAINTENANT).code;
  assert.equal(s("finished", "2026-11-08T10:00:00"), "finie");
  assert.equal(s("finished", "2026-11-08T10:00:00", 4), "ecourtee");
  assert.equal(s("abandoned", "2026-11-08T10:00:00", 4), "abandon");
  assert.equal(s("in_progress", "2026-11-08T10:00:00", 4), "bloquee");
  assert.equal(s("in_progress", "2026-11-08T16:30:00", 4), "en_cours");
});

test("carnet : une soirée qui passe minuit, tests et orphelines à part", () => {
  const c = Q.construire(D, A, { maintenant: MAINTENANT });
  assert.deepEqual(c.map((s) => s.jour), ["2026-11-07", "2026-11-03", "2026-11-01"]);
  const sam = c[0];
  assert.deepEqual(sam.parties.map((p) => p.id), [101, 103]);
  assert.equal(sam.tests, 1);
  assert.equal(sam.debut, "21h40");
  assert.equal(sam.parties[1].etat.code, "bloquee");
  // Alice est nouvelle ce soir, Bob était venu le 01/11.
  assert.deepEqual(sam.joueurs.map((j) => [j.n, j.nouveau, j.parties, j.liens]), [["J1", false, 1, 0], ["J2", true, 2, 2]]);
  assert.equal(sam.nouveaux, 1);
  // Scores du meilleur au moins bon, sans pseudo.
  assert.deepEqual(sam.parties[0].joueurs, [{ nom: "J1", score: 20 }, { nom: "J2", score: 14 }]);
});

test("carnet : sources reliées par le code de salle du même jour, Discord par la base", () => {
  const [sam] = Q.construire(D, A, { maintenant: MAINTENANT });
  assert.deepEqual(sam.parties[0].sources, { google: 1, invitation: 2 });
  assert.deepEqual(sam.parties[1].sources, { discord_activite: 1 });
  assert.equal(sam.visites.visites, 9);
});

test("carnet : les avis vont à leur partie, l'avis de test est écarté", () => {
  const [sam] = Q.construire(D, A, { maintenant: MAINTENANT });
  assert.equal(sam.parties[0].avis.length, 1);
  assert.equal(sam.avis.length, 0);
  const avecTests = Q.construire(D, A, { maintenant: MAINTENANT, tests: true })[0];
  assert.deepEqual(avecTests.parties.map((p) => p.id), [101, 102, 103]);
  assert.equal(avecTests.parties[1].avis.length, 1);
});

test("totaux : joueurs et nouveaux comptés une fois sur la période", () => {
  const c = Q.construire(D, A, { maintenant: MAINTENANT });
  assert.deepEqual(Q.totaux(c, 1, "2026-11-08"), { parties: 0, tests: 0, joueurs: 0, nouveaux: 0, visites: 0, ont_joue: 0, sans_jouer: 0 });
  // 7 jours = du 02 au 08/11 : la soirée du 01/11 (nouveau Bob) en est exclue.
  assert.deepEqual(Q.totaux(c, 7, "2026-11-08"), { parties: 2, tests: 1, joueurs: 2, nouveaux: 1, visites: 11, ont_joue: 4, sans_jouer: 1 });
  assert.deepEqual(Q.totaux(c, 30, "2026-11-08"), { parties: 3, tests: 1, joueurs: 2, nouveaux: 2, visites: 11, ont_joue: 4, sans_jouer: 1 });
});

test("sans arrivées : le carnet se construit quand même", () => {
  const c = Q.construire(D, null, { maintenant: MAINTENANT });
  assert.deepEqual(c.map((s) => s.jour), ["2026-11-07", "2026-11-01"]);
  assert.deepEqual(c[0].parties[0].sources, {});
});

test("rendu : texte des joueurs échappé, jamais de pseudo", () => {
  const [sam] = Q.construire(D, A, { maintenant: MAINTENANT });
  const html = Q.rendreSoiree(sam);
  assert.ok(html.includes("&lt;b&gt;trop&lt;/b&gt; bien"));
  assert.ok(!html.includes("<b>trop</b>"));
  assert.ok(!html.includes("NePasAfficher"));
  assert.ok(html.includes("contact laissé"));
  assert.ok(html.includes("2 imports ratés"));
  assert.ok(html.includes("/blind-test-spotify/ <b class=\"num\">3</b>"));
  assert.ok(html.includes("page déjà ouverte") && html.includes("forum-exemple") && html.includes("téléphone"));
  assert.ok(html.includes("/&lt;x&gt;/") && !html.includes("/<x>/"));
});

test("séries : 3 parties de suite dans la même salle et le même mode se regroupent", () => {
  const p = (id, salle, mode = "event") => ({ id, salle, mode });
  const g = Q.grouper([p(1, "AAA111"), p(2, "AAA111"), p(3, "AAA111"), p(4, "BBB222"), p(5, "BBB222"), p(6, null), p(7, null), p(8, null)]);
  assert.deepEqual(g.map((x) => (x.serie ? x.serie.map((y) => y.id) : x.partie.id)), [[1, 2, 3], 4, 5, 6, 7, 8]);
});

test("durée : une fin posée par le ménage le lendemain n'est pas une durée de jeu", () => {
  const D2 = { ...D, sessions: [{ id: 200, mode: "friends", etat: "finished", debut: "2026-11-06T19:30:00", duree_s: 105120, manches: 10, jouees: 10, salle: null, test: false, orpheline: false }],
    participations: [{ s: 200, u: 1, score: 2 }] };
  const ven = Q.construire(D2, null, { maintenant: MAINTENANT }).find((s) => s.jour === "2026-11-06");
  assert.equal(ven.parties[0].duree_s, null);
  assert.equal(ven.parties[0].fin_menage, true);
  assert.ok(Q.rendreSoiree(ven).includes("fin non enregistrée"));
});
