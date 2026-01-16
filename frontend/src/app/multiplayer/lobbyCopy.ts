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
  streamer: {
    title: "Mode Streamer",
    subtitle: "Joue en live avec ton chat - 3 modes de jeu disponibles.",
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
  streamer: {
    hostTitle: "Lance le mode streamer",
    hostSubtitle: "Choisis ton format : chat, streamer, ou les deux.",
    hostCta: "Démarrer le stream",
  },
}

export const HOST_START_LABEL: Record<GameMode, string> = {
  friends: "Lancer le duel",
  event: "Lancer la projection",
  streamer: "Lancer le stream",
}

export const WAITING_TITLE: Record<GameMode, { title: string; subtitle: string }> = {
  friends: { title: "Prêts à se départager", subtitle: "Ça démarre dès que tout le monde est chaud." },
  event: { title: "Salle en rythme", subtitle: "L'écran principal gère le tempo, restez prêts." },
  streamer: { title: "Stream en préparation", subtitle: "Le chat peut rejoindre avec le code." },
}

export const ENTRY_ROUTE: Record<GameMode, string> = {
  friends: "/friends",
  event: "/event",
  streamer: "/streamer",
}

export const PARTICIPANT_TITLES: Record<GameMode, string> = {
  friends: "Rivaux connectés",
  event: "Public connecté",
  streamer: "Viewers connectés",
}

export const HERO_POINTS: Record<GameMode, string[]> = {
  friends: ["Scores visibles", "Invitations éclair", "Playlists partagées"],
  event: ["Un écran pilote", "Tempo régulier", "Lisible pour le public"],
  streamer: ["3 modes de jeu", "Chat + Streamer", "Scores en direct"],
}
