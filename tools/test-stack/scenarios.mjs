// Les salles de la campagne. Cinq salles de six joueurs tournent en parallele
// (c'est l'echelle realiste du VPS), chacune couvre un chemin different du
// moteur de jeu. La graine rend chaque tirage rejouable a l'identique.
import { plans } from "./room.mjs"

const { toujours, melange, avec } = plans

export function botScenarios(seed) {
  return [
    {
      label: "Autour d'une table · présentateur",
      mode: "event", hostPlays: false, rounds: 5, seconds: 10, seed: seed + 1,
      players: [
        { name: "Presentateur", plan: toujours("muet") },
        ...["Anais", "Bastien", "Chloe", "Dylan", "Eva"].map((name, i) => ({ name, plan: melange(seed * 10 + i) })),
      ],
    },
    {
      label: "Autour d'une table · je joue aussi",
      mode: "event", hostPlays: true, rounds: 5, seconds: 10, seed: seed + 2,
      players: [
        { name: "HoteJoueur", plan: toujours("juste") },
        { name: "Farid", plan: avec(melange(seed * 20 + 1), { 2: { action: "juste", deco: true } }) },
        ...["Gaelle", "Hugo", "Ines", "Jules"].map((name, i) => ({ name, plan: melange(seed * 20 + 2 + i) })),
      ],
    },
    {
      label: "À distance · chaos",
      mode: "friends", rounds: 5, seconds: 12, seed: seed + 3,
      late: { name: "Retardataire", afterMs: 14000 },
      players: [
        { name: "Hote", plan: melange(seed * 30) },
        { name: "Coupure", plan: avec(melange(seed * 30 + 1), { 2: { action: "proche", deco: true }, 4: { action: "juste", deco: true } }) },
        { name: "Partant", plan: avec(toujours("juste"), { 3: { quitte: true } }) },
        ...["Kenza", "Leo", "Maya"].map((name, i) => ({ name, plan: melange(seed * 30 + 2 + i) })),
      ],
    },
    {
      // Tout le monde repond juste et vite : chaque manche se revele avant la
      // minuterie (chemin "early reveal" du serveur).
      label: "À distance · révélation anticipée",
      mode: "friends", rounds: 5, seconds: 15, seed: seed + 4,
      players: ["Nina", "Oscar", "Paul", "Quentin", "Rose", "Sami"].map(name => ({ name, plan: toujours("juste") })),
    },
    {
      // Personne ne repond : chaque manche va au bout de la minuterie, et
      // l'enchainement ne tient qu'aux "pret" et au filet anti-AFK.
      label: "À distance · minuterie et silences",
      mode: "friends", rounds: 4, seconds: 10, seed: seed + 5,
      players: [
        { name: "Tess", plan: toujours("faux") },
        ...["Ugo", "Vera", "Wes", "Xena", "Yann"].map(name => ({ name, plan: toujours("muet") })),
      ],
    },
  ]
}
