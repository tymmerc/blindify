// Mode streamer : celui qui a apporte le morceau ne devine pas sa manche.
// Depuis la migration 005, un morceau peut etre a plusieurs joueurs de la
// salle (owner_user_ids) : aucun d'eux ne doit pouvoir le deviner.
// Aucune base ici : la fin de partie (gamePersistence) est simulee.

jest.mock("../../src/services/gamePersistence", () => ({
  markMultiplayerRoomFinished: jest.fn(async () => undefined),
}));

import type { Server as IOServer } from "socket.io";
import type { StreamerRound } from "../../src/types/streamer";
import {
  bootstrapStreamerGame,
  clearStreamerGame,
  recordChatGuess,
  startNextStreamerRound,
} from "../../src/services/streamerGame";

const ROOM = "STREAM1";
const HOST = 1;
const OWNER = 2;
const CO_OWNER = 3;
const VIEWER = 4;

function fakeIo() {
  const emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit })) } as unknown as IOServer;
  return { io, emit };
}

const round: StreamerRound = {
  round: 1,
  trackId: "t1",
  title: "Morceau",
  artist: "Artiste",
  previewUrl: "https://extraits.test/t1.mp3",
  metadata: { owner_user_id: OWNER, owner_user_ids: [OWNER, CO_OWNER] },
  trackSource: "chat",
};

/** Une manche ouverte au chat (apres le compte a rebours). */
function chatPhase() {
  const { io, emit } = fakeIo();
  bootstrapStreamerGame({ roomCode: ROOM, hostUserId: HOST, rounds: [round], subMode: "viewers_only" });
  startNextStreamerRound(io, ROOM);
  jest.advanceTimersByTime(3_000);
  emit.mockClear();
  return { io, emit };
}

describe("streamer : qui a apporte le morceau ne le devine pas", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    clearStreamerGame(ROOM);
    jest.useRealTimers();
  });

  it("un spectateur qui n'a pas le morceau devine", () => {
    const { io, emit } = chatPhase();
    recordChatGuess(io, ROOM, VIEWER, "morceau artiste");
    expect(emit).toHaveBeenCalledWith("state:sync", expect.anything());
  });

  it("le contributeur de la manche ne devine pas", () => {
    const { io, emit } = chatPhase();
    recordChatGuess(io, ROOM, OWNER, "morceau artiste");
    expect(emit).not.toHaveBeenCalled();
  });

  it("un autre joueur qui a importe le meme morceau ne devine pas non plus", () => {
    const { io, emit } = chatPhase();
    recordChatGuess(io, ROOM, CO_OWNER, "morceau artiste");
    expect(emit).not.toHaveBeenCalled();
  });
});
