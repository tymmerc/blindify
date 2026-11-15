/**
 * Parties fantomes et joueurs absents (T22) : la machine a etats, sans socket
 * ni base.
 *
 * Vu en prod le 01/11 (un joueur parti reste 3 parties de suite a 20 reponses
 * vides sur 20) et le 14/11 (partie 829 : la table part ouvrir une autre
 * salle, l'ancienne tourne seule 12 manches ; partie 830 : un joueur reste au
 * classement avec 12 reponses vides sur 13).
 */
import {
  ABSENT_AFTER_MISSED_ROUNDS,
  EMPTY_PAUSE_MS,
  IDLE_STOP_MS,
  SILENT_ROUNDS_BEFORE_PAUSE,
  admitToGame,
  bootstrapGameState,
  clearGame,
  earlyRevealDecision,
  forgetRoomAbsence,
  getGameState,
  idleCheck,
  isPausedByIdle,
  markDisconnected,
  markPresent,
  pauseGame,
  recordAnswer,
  revealRound,
  roomAbsentUserIds,
  startNextRound,
  startReconnectGrace,
  type RoundTrack,
} from "../../src/services/realtimeGame";

const ROOM = "TEST_ABSENT_ROOM";

function makeTracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

function setup(opts: { players?: number[]; rounds?: number; mode?: string; hostPlays?: boolean } = {}): void {
  clearGame(ROOM);
  bootstrapGameState({
    roomCode: ROOM,
    hostUserId: 1,
    hostPlays: opts.hostPlays,
    tracks: makeTracks(opts.rounds ?? 10),
    participants: (opts.players ?? [1, 2, 3]).map(id => ({ userId: id, username: `P${id}` })),
    mode: opts.mode ?? "friends",
    config: { roundDurationMs: 20_000 },
  });
  startNextRound(ROOM);
}

/** Une manche : ceux de `answering` repondent, puis revelation et manche suivante. */
function playRound(answering: number[], next = true): void {
  for (const id of answering) recordAnswer(ROOM, id, "une reponse");
  revealRound(ROOM);
  if (next && !getGameState(ROOM)?.paused) startNextRound(ROOM);
}

const player = (id: number) => getGameState(ROOM)!.players[id];

afterEach(() => {
  clearGame(ROOM);
  forgetRoomAbsence(ROOM, [1, 2, 3, 4, 5]);
});

describe("joueur absent", () => {
  it(`passe absent apres ${ABSENT_AFTER_MISSED_ROUNDS} manches sans reponse, connecte ou non`, () => {
    setup();
    playRound([1, 2]);
    playRound([1, 2]);
    expect(player(3).absent).toBeFalsy();
    playRound([1, 2]);
    expect(player(3).absent).toBe(true);
    // Il reste au classement, marque.
    expect(Object.keys(getGameState(ROOM)!.players)).toHaveLength(3);
    expect(roomAbsentUserIds(ROOM)).toEqual([3]);
  });

  it("« Je sais pas » compte comme une reponse : jamais absent pour ca", () => {
    setup();
    for (let i = 0; i < 4; i++) {
      recordAnswer(ROOM, 3, "");
      playRound([1, 2]);
    }
    expect(player(3).absent).toBeFalsy();
  });

  it("une reponse de temps en temps remet le compteur a zero", () => {
    setup();
    playRound([1, 2]);
    playRound([1, 2]);
    playRound([1, 2, 3]);
    playRound([1, 2]);
    playRound([1, 2]);
    expect(player(3).absent).toBeFalsy();
  });

  it("ne retient plus la manche : les presents repondent, revelation tout de suite", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    recordAnswer(ROOM, 1, "x");
    recordAnswer(ROOM, 2, "y");
    expect(earlyRevealDecision(ROOM)).toEqual({ kind: "reveal" });
  });

  it("coupe pendant sa grace de reconnexion, un absent ne retient pas non plus la manche", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    markDisconnected(ROOM, 3);
    startReconnectGrace(ROOM, 3);
    recordAnswer(ROOM, 1, "x");
    recordAnswer(ROOM, 2, "y");
    expect(earlyRevealDecision(ROOM)).toEqual({ kind: "reveal" });
  });

  it("revient des qu'il repond, ici et pour la partie suivante", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    expect(player(3).absent).toBe(true);
    recordAnswer(ROOM, 3, "je suis la");
    expect(player(3).absent).toBe(false);
    expect(roomAbsentUserIds(ROOM)).toEqual([]);
  });

  it("revient d'un clic sur « Je suis là »", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    expect(markPresent(ROOM, 3)).toBe("player");
    expect(player(3).absent).toBe(false);
    expect(roomAbsentUserIds(ROOM)).toEqual([]);
    // Le compteur repart de zero : pas absent a la manche d'apres.
    playRound([1, 2]);
    expect(player(3).absent).toBe(false);
  });

  it("l'hote qui presente seulement n'est jamais compte absent (event)", () => {
    setup({ mode: "event", hostPlays: false, players: [2, 3] });
    for (let i = 0; i < 5; i++) playRound([2, 3]);
    expect(roomAbsentUserIds(ROOM)).toEqual([]);
    expect(getGameState(ROOM)!.paused).toBeFalsy();
  });

  it("l'hote qui joue aussi (event) est un joueur comme un autre", () => {
    setup({ mode: "event", hostPlays: true, players: [1, 2, 3] });
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([2, 3]);
    expect(player(1).absent).toBe(true);
  });

  it("le retardataire promu repart de zero manche manquee", () => {
    setup();
    playRound([1, 2, 3], false);
    expect(admitToGame(ROOM, { userId: 4, username: "P4" })).toBe("arrived");
    startNextRound(ROOM);
    playRound([1, 2, 3]);
    playRound([1, 2, 3]);
    expect(player(4).absent).toBeFalsy();
  });
});

describe("Rejouer sans l'absent", () => {
  it("la partie suivante le liste a part ; une reconnexion ne le remet pas en jeu, son clic si", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    // Rejouer : le controleur ne met que les presents dans la nouvelle partie.
    setup({ players: [1, 2] });
    expect(getGameState(ROOM)!.absentees).toEqual([{ userId: 3, username: "P3" }]);
    expect(admitToGame(ROOM, { userId: 3, username: "P3" })).toBe("absent");
    expect(getGameState(ROOM)!.players[3]).toBeUndefined();
    expect(getGameState(ROOM)!.waiting).toEqual([]);

    expect(markPresent(ROOM, 3)).toBe("back");
    expect(getGameState(ROOM)!.absentees).toEqual([]);
    expect(admitToGame(ROOM, { userId: 3, username: "P3" })).toBe("arrived");
    startNextRound(ROOM);
    expect(player(3)).toBeDefined();
  });

  it("forgetRoomAbsence (relance avec eux faute de joueurs) les rend joueurs normaux", () => {
    setup();
    for (let i = 0; i < ABSENT_AFTER_MISSED_ROUNDS; i++) playRound([1, 2]);
    forgetRoomAbsence(ROOM, [3]);
    setup();
    expect(getGameState(ROOM)!.absentees).toEqual([]);
    expect(player(3).absent).toBeFalsy();
  });
});

describe("partie ou personne ne repond", () => {
  it(`se met en veille a la ${SILENT_ROUNDS_BEFORE_PAUSE}e manche sans aucune reponse`, () => {
    setup();
    playRound([]);
    playRound([]);
    expect(getGameState(ROOM)!.paused).toBeFalsy();
    const before = Date.now();
    playRound([]);
    const state = getGameState(ROOM)!;
    expect(state.phase).toBe("REVEAL");
    expect(state.paused).toBe(true);
    expect(state.idle?.reason).toBe("silent");
    expect(state.idle!.stopAt).toBeGreaterThanOrEqual(before + IDLE_STOP_MS);
  });

  it("une seule reponse dans la salle suffit a la garder en vie", () => {
    setup();
    for (let i = 0; i < 6; i++) playRound(i % 3 === 2 ? [2] : []);
    expect(getGameState(ROOM)!.paused).toBeFalsy();
  });

  it("pas de veille a la derniere manche : le podium arrive", () => {
    setup({ rounds: 3 });
    playRound([]);
    playRound([]);
    playRound([], false);
    expect(getGameState(ROOM)!.paused).toBeFalsy();
  });

  it("« Je suis là » d'un joueur relance la partie", () => {
    setup();
    for (let i = 0; i < SILENT_ROUNDS_BEFORE_PAUSE; i++) playRound([]);
    expect(markPresent(ROOM, 2)).toBe("player");
    const state = getGameState(ROOM)!;
    expect(state.paused).toBe(false);
    expect(state.idle).toBeNull();
  });

  it("arret quand la veille a dure sans retour", () => {
    setup();
    for (let i = 0; i < SILENT_ROUNDS_BEFORE_PAUSE; i++) playRound([]);
    const stopAt = getGameState(ROOM)!.idle!.stopAt;
    const everyone = () => true;
    expect(idleCheck(ROOM, everyone, stopAt - 1)).toBe("none");
    expect(idleCheck(ROOM, everyone, stopAt)).toBe("stop");
  });
});

describe("partie sans joueur connecte", () => {
  const nobody = () => false;
  const everyone = () => true;

  it(`en veille apres ${EMPTY_PAUSE_MS / 1000} s sans joueur, arret ${IDLE_STOP_MS / 60_000} min plus tard`, () => {
    setup();
    const t0 = 1_000_000;
    expect(idleCheck(ROOM, nobody, t0)).toBe("none");
    expect(idleCheck(ROOM, nobody, t0 + EMPTY_PAUSE_MS - 1)).toBe("none");
    expect(idleCheck(ROOM, nobody, t0 + EMPTY_PAUSE_MS)).toBe("pause");
    expect(getGameState(ROOM)!.paused).toBe(true);
    expect(getGameState(ROOM)!.idle).toEqual({ reason: "empty", stopAt: t0 + EMPTY_PAUSE_MS + IDLE_STOP_MS });
    expect(idleCheck(ROOM, nobody, t0 + EMPTY_PAUSE_MS + IDLE_STOP_MS - 1)).toBe("none");
    expect(idleCheck(ROOM, nobody, t0 + EMPTY_PAUSE_MS + IDLE_STOP_MS)).toBe("stop");
  });

  it("un joueur coupe (drapeau) compte comme parti, meme si son vieux socket traine", () => {
    setup();
    for (const id of [1, 2, 3]) markDisconnected(ROOM, id);
    expect(idleCheck(ROOM, everyone, 0)).toBe("none");
    expect(idleCheck(ROOM, everyone, EMPTY_PAUSE_MS)).toBe("pause");
  });

  it("une coupure courte (grace de 5 s, rechargement) ne fige rien", () => {
    setup();
    expect(idleCheck(ROOM, nobody, 0)).toBe("none");
    expect(idleCheck(ROOM, nobody, 6_000)).toBe("none");
    expect(idleCheck(ROOM, everyone, 8_000)).toBe("none");
    expect(idleCheck(ROOM, nobody, 9_000)).toBe("none");
    expect(idleCheck(ROOM, nobody, 9_000 + EMPTY_PAUSE_MS - 1)).toBe("none");
    expect(getGameState(ROOM)!.paused).toBeFalsy();
  });

  it("reprend ou elle en etait quand un joueur revient", () => {
    setup();
    const revealAt = getGameState(ROOM)!.timing.revealAt!;
    idleCheck(ROOM, nobody, 0);
    expect(idleCheck(ROOM, nobody, EMPTY_PAUSE_MS)).toBe("pause");
    expect(isPausedByIdle(ROOM)).toBe(true);
    expect(idleCheck(ROOM, everyone, EMPTY_PAUSE_MS + 60_000)).toBe("resume");
    const state = getGameState(ROOM)!;
    expect(state.paused).toBe(false);
    expect(state.idle).toBeNull();
    // Le chrono a ete gele pendant la veille.
    expect(state.timing.revealAt).toBe(revealAt + 60_000);
  });

  it("l'hote qui presente seul devant l'ecran ne garde pas la partie en vie", () => {
    setup({ mode: "event", hostPlays: false, players: [2, 3] });
    const onlyPresenter = (id: number) => id === 1;
    idleCheck(ROOM, onlyPresenter, 0);
    expect(idleCheck(ROOM, onlyPresenter, EMPTY_PAUSE_MS)).toBe("pause");
  });

  it("des joueurs connectes, l'hote presentateur parti : la partie continue", () => {
    setup({ mode: "event", hostPlays: false, players: [2, 3] });
    const playersOnly = (id: number) => id !== 1;
    idleCheck(ROOM, playersOnly, 0);
    expect(idleCheck(ROOM, playersOnly, EMPTY_PAUSE_MS * 10)).toBe("none");
    expect(getGameState(ROOM)!.paused).toBeFalsy();
  });

  it("une pause de l'hote reste la sienne : un retour ne la leve pas, l'heure d'arret tombe", () => {
    setup();
    pauseGame(ROOM, 0);
    idleCheck(ROOM, nobody, 0);
    expect(idleCheck(ROOM, nobody, EMPTY_PAUSE_MS)).toBe("pause");
    expect(getGameState(ROOM)!.idle?.reason).toBe("empty");
    // Si l'hote part maintenant, sa pause doit encore pouvoir etre levee pour lui.
    expect(isPausedByIdle(ROOM)).toBe(false);
    expect(idleCheck(ROOM, everyone, EMPTY_PAUSE_MS + 1)).toBe("clear");
    expect(getGameState(ROOM)!.paused).toBe(true);
    expect(getGameState(ROOM)!.idle).toBeNull();
  });

  it("rien sur une partie finie", () => {
    setup({ rounds: 1 });
    playRound([1, 2, 3]);
    expect(getGameState(ROOM)!.phase).toBe("FINISHED");
    expect(idleCheck(ROOM, nobody, 0)).toBe("none");
    expect(idleCheck(ROOM, nobody, IDLE_STOP_MS * 10)).toBe("none");
  });
});
