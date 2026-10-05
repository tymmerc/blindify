/**
 * Grace de reconnexion (decision de Tym du 02/10/2026) : un joueur coupe du
 * reseau en pleine manche, sans avoir repondu, a DISCONNECT_GRACE_MS pour
 * revenir avant que la manche soit revelee en avance. Ici la logique pure :
 * l'horloge est passee en parametre, aucun minuteur ne tourne.
 */
import {
  DISCONNECT_GRACE_MS,
  bootstrapGameState,
  clearGame,
  earlyRevealDecision,
  endReconnectGrace,
  markDisconnected,
  markReady,
  markReconnected,
  pauseGame,
  recordAnswer,
  resumeGame,
  revealRound,
  startNextRound,
  startReconnectGrace,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "TEST_GRACE_ROOM";
const T0 = 1_000_000;

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

function setupRound(opts?: { players?: number; mode?: string; reconnectGraceMs?: number }): void {
  clearGame(ROOM);
  bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    tracks: makeTracks(3),
    participants: Array.from({ length: opts?.players ?? 3 }, (_, i) => ({ userId: i + 1, username: `P${i + 1}` })),
    mode: opts?.mode ?? "friends",
    config: { roundDurationMs: 20_000 },
    reconnectGraceMs: opts?.reconnectGraceMs,
  });
  startNextRound(ROOM);
}

/** Coupure reseau d'un joueur, comme le fait le gestionnaire "disconnecting". */
function drop(userId: number, at: number): number | null {
  markDisconnected(ROOM, userId);
  return startReconnectGrace(ROOM, userId, at);
}

afterEach(() => {
  clearGame(ROOM);
});

describe("grace de reconnexion : la decision de revelation anticipee", () => {
  it("dure 5 s, la valeur decidee par Tym le 02/10/2026", () => {
    expect(DISCONNECT_GRACE_MS).toBe(5_000);
  });

  it("ne revele pas tant qu'un joueur connecte n'a pas repondu", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "none" });
  });

  it("revele quand tous les connectes ont repondu et que personne n'est en grace", () => {
    setupRound();
    [1, 2, 3].forEach(id => recordAnswer(ROOM, id, "Song 1 Artist 1"));
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "reveal" });
  });

  it("un joueur parti par \"Quitter\" (sans grace) n'est pas attendu", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    markDisconnected(ROOM, 3);
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "reveal" });
  });

  it("attend le joueur coupe sans reponse jusqu'a la fin de sa grace, pas une milliseconde de plus", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    expect(drop(3, T0)).toBe(T0 + DISCONNECT_GRACE_MS);

    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "wait", until: T0 + DISCONNECT_GRACE_MS });
    expect(earlyRevealDecision(ROOM, T0 + DISCONNECT_GRACE_MS - 1)).toEqual({ kind: "wait", until: T0 + DISCONNECT_GRACE_MS });
    expect(earlyRevealDecision(ROOM, T0 + DISCONNECT_GRACE_MS)).toEqual({ kind: "reveal" });
  });

  it("attend aussi quand les autres finissent de repondre pendant la coupure", () => {
    setupRound();
    drop(3, T0);
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    expect(earlyRevealDecision(ROOM, T0 + 2_000)).toEqual({ kind: "wait", until: T0 + DISCONNECT_GRACE_MS });
  });

  it("un joueur revenu pendant sa grace peut encore repondre : la manche continue jusqu'a sa reponse", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    markReconnected(ROOM, 3);
    expect(earlyRevealDecision(ROOM, T0 + 1_000)).toEqual({ kind: "none" });
    expect(earlyRevealDecision(ROOM, T0 + 60_000)).toEqual({ kind: "none" });
    recordAnswer(ROOM, 3, "Song 1 Artist 1");
    expect(earlyRevealDecision(ROOM, T0 + 1_500)).toEqual({ kind: "reveal" });
  });

  it("un joueur qui avait deja repondu avant de couper n'est pas attendu", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 3, "Song 1 Artist 1");
    expect(drop(3, T0)).toBeNull();
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "none" });
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    expect(earlyRevealDecision(ROOM, T0 + 100)).toEqual({ kind: "reveal" });
  });

  it("plusieurs coupures : attend la fin de la derniere grace", () => {
    setupRound({ players: 4 });
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    drop(4, T0 + 2_000);
    const lastUntil = T0 + 2_000 + DISCONNECT_GRACE_MS;
    expect(earlyRevealDecision(ROOM, T0 + 100)).toEqual({ kind: "wait", until: lastUntil });
    // La grace du joueur 3 est finie, pas celle du 4.
    expect(earlyRevealDecision(ROOM, T0 + DISCONNECT_GRACE_MS + 500)).toEqual({ kind: "wait", until: lastUntil });
    expect(earlyRevealDecision(ROOM, lastUntil)).toEqual({ kind: "reveal" });
  });

  it("revenu puis recoupe : une grace neuve part de la seconde coupure", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    markReconnected(ROOM, 3);
    drop(3, T0 + 3_000);
    expect(earlyRevealDecision(ROOM, T0 + DISCONNECT_GRACE_MS + 100)).toEqual({
      kind: "wait",
      until: T0 + 3_000 + DISCONNECT_GRACE_MS,
    });
  });

  it("revenu puis parti par \"Quitter\" : sa grace est consommee, il n'est plus attendu", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    markReconnected(ROOM, 3);
    markDisconnected(ROOM, 3);
    expect(earlyRevealDecision(ROOM, T0 + 1_000)).toEqual({ kind: "reveal" });
  });

  it("revenu puis parti par \"Quitter\" depuis un autre socket : endReconnectGrace leve sa grace", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    // Le gestionnaire "Quitter" : deja marque deconnecte, plus rien a attendre.
    markDisconnected(ROOM, 3);
    endReconnectGrace(ROOM, 3);
    expect(earlyRevealDecision(ROOM, T0 + 1_000)).toEqual({ kind: "reveal" });
    // Salle inconnue ou joueur sans grace : rien a faire, pas d'erreur.
    expect(() => endReconnectGrace("NOPE", 3)).not.toThrow();
    expect(() => endReconnectGrace(ROOM, 2)).not.toThrow();
  });

  it("pause de l'hote : la grace en cours est gelee et reprend ou elle en etait", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    drop(3, T0);
    // Pause 1 s apres la coupure : il lui reste 4 s.
    pauseGame(ROOM, T0 + 1_000);
    expect(earlyRevealDecision(ROOM, T0 + 60_000)).toEqual({ kind: "none" });
    resumeGame(ROOM, T0 + 61_000);
    const until = T0 + 61_000 + DISCONNECT_GRACE_MS - 1_000;
    expect(earlyRevealDecision(ROOM, T0 + 61_000)).toEqual({ kind: "wait", until });
    expect(earlyRevealDecision(ROOM, until - 1)).toEqual({ kind: "wait", until });
    expect(earlyRevealDecision(ROOM, until)).toEqual({ kind: "reveal" });
  });

  it("coupure pendant la pause : toute la grace part de la reprise", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    pauseGame(ROOM, T0);
    // Les reponses sont refusees en pause : sa grace ne doit pas s'y ecouler.
    drop(3, T0 + 1_000);
    resumeGame(ROOM, T0 + 30_000);
    expect(earlyRevealDecision(ROOM, T0 + 30_000)).toEqual({
      kind: "wait",
      until: T0 + 30_000 + DISCONNECT_GRACE_MS,
    });
  });

  it("une grace deja finie avant la pause reste finie a la reprise", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    drop(3, T0);
    pauseGame(ROOM, T0 + DISCONNECT_GRACE_MS + 1_000);
    resumeGame(ROOM, T0 + 30_000);
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    expect(earlyRevealDecision(ROOM, T0 + 30_000)).toEqual({ kind: "reveal" });
  });

  it("la grace d'une manche ne retient pas la suivante", () => {
    setupRound();
    recordAnswer(ROOM, 1, "Song 1 Artist 1");
    drop(3, T0);
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    revealRound(ROOM);
    markReady(ROOM, 1);
    const next = markReady(ROOM, 2);
    expect(next?.currentRound).toBe(2);
    // Le joueur 3 est toujours absent, mais sa grace etait celle de la manche 1.
    recordAnswer(ROOM, 1, "Song 2 Artist 2");
    recordAnswer(ROOM, 2, "Song 2 Artist 2");
    expect(earlyRevealDecision(ROOM, T0 + 100)).toEqual({ kind: "reveal" });
  });

  it("pas de grace hors manche (revelation, lobby)", () => {
    setupRound();
    revealRound(ROOM);
    markDisconnected(ROOM, 3);
    expect(startReconnectGrace(ROOM, 3, T0)).toBeNull();
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "none" });
  });

  it("l'hote qui presente seulement (mode event) n'est jamais attendu", () => {
    setupRound({ mode: "event" });
    recordAnswer(ROOM, 2, "Song 1 Artist 1");
    recordAnswer(ROOM, 3, "Song 1 Artist 1");
    drop(1, T0);
    expect(earlyRevealDecision(ROOM, T0)).toEqual({ kind: "reveal" });
  });

  it("duree reglable pour les tests, valeur par defaut si elle est invalide", () => {
    setupRound({ reconnectGraceMs: 800 });
    expect(drop(3, T0)).toBe(T0 + 800);
    setupRound({ reconnectGraceMs: -1 });
    expect(drop(3, T0)).toBe(T0 + DISCONNECT_GRACE_MS);
    setupRound({ reconnectGraceMs: Number.NaN });
    expect(drop(3, T0)).toBe(T0 + DISCONNECT_GRACE_MS);
  });

  it("salle inconnue : ni grace ni revelation", () => {
    expect(startReconnectGrace("NOPE", 1, T0)).toBeNull();
    expect(earlyRevealDecision("NOPE", T0)).toEqual({ kind: "none" });
  });
});
