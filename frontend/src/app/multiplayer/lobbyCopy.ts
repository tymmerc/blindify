import type { GameMode } from "@/lib/gameModes"

export const HEADER_COPY: Record<GameMode, { title: string; subtitle: string }> = {
  friends: {
    title: "Défie tes amis",
    subtitle: "Duels, revanche, et playlists partagées.",
  },
  event: {
    title: "Projection en direct",
    subtitle: "Un seul écran, un rythme clair, tout le monde suit.",
  },
  chat: {
    title: "Salon en direct",
    subtitle: "La musique tourne, le chat répond en continu.",
  },
}

export const LANDING_COPY: Record<
  GameMode,
  { hostTitle: string; hostSubtitle: string; hostCta: string; joinTitle?: string; joinSubtitle?: string }
> = {
  friends: {
    hostTitle: "Lance un duel entre amis",
    hostSubtitle: "Invitations rapides, scores pour les bragging rights.",
    hostCta: "Ouvrir le duel",
    joinTitle: "Ils t'ont envoyé un code ?",
    joinSubtitle: "Tape-le et attrape-les.",
  },
  event: {
    hostTitle: "Prêt pour la projection",
    hostSubtitle: "Rythme piloté, affichage lisible, tout le monde suit.",
    hostCta: "Démarrer la projection",
  },
  chat: {
    hostTitle: "Met le salon en marche",
    hostSubtitle: "La musique défile, les réponses fusent en live.",
    hostCta: "Entrer dans le flux",
  },
}

export const HOST_START_LABEL: Record<GameMode, string> = {
  friends: "Lancer le duel",
  event: "Lancer la projection",
  chat: "Lancer le flux",
}

export const WAITING_TITLE: Record<GameMode, { title: string; subtitle: string }> = {
  friends: { title: "Prêts à se départager", subtitle: "Ça démarre dès que tout le monde est chaud." },
  event: { title: "Salle en rythme", subtitle: "L’écran principal gère le tempo, restez prêts." },
  chat: { title: "Flux en direct", subtitle: "La musique arrive, répondez sans attendre." },
}

export const ENTRY_ROUTE: Record<GameMode, string> = {
  friends: "/friends",
  event: "/event",
  chat: "/chat",
}

export const PARTICIPANT_TITLES: Record<GameMode, string> = {
  friends: "Rivaux connectés",
  event: "Public connecté",
  chat: "Voix en direct",
}

export const HERO_POINTS: Record<GameMode, string[]> = {
  friends: ["Scores visibles", "Invitations éclair", "Playlists partagées"],
  event: ["Un écran pilote", "Tempo régulier", "Lisible pour le public"],
  chat: ["Musique en continu", "Réponses instantanées", "Ambiance salon"],
}
