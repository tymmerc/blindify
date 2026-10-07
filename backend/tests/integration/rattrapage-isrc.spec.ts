/**
 * Rattrapage des ISRC (src/scripts/rattrapageIsrc.ts) contre une vraie base de
 * test, avec un faux Spotify (axios simule) : aucun appel reseau.
 *
 * Ce qui est verifie :
 * - essai : rien n'est ecrit, les compteurs sont justes ;
 * - ecriture : seule la cle isrc est ajoutee, les autres cles de metadata
 *   restent, metadata NULL devient {"isrc": ...} ;
 * - un ISRC mal forme ou absent n'est jamais ecrit, un ISRC deja la n'est
 *   jamais remplace, les morceaux Deezer ne sont pas touches ;
 * - lots de 50 ids au plus ; relancer ne refait que ce qui manque ;
 * - 429 : on attend Retry-After puis on reprend ; Retry-After trop long : arret.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from "axios";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { rattrapageIsrc, strictIsrc, parseArgs } from "../../src/scripts/rattrapageIsrc";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const get = axios.get as jest.Mock;
const post = axios.post as jest.Mock;
const PREFIX = "Rtrp";
const id = (i: number) => `${PREFIX}${String(i).padStart(18, "0")}`; // 22 caracteres, comme Spotify

// Le faux Spotify : ISRC par id, null = morceau inconnu.
let catalogue: Record<string, string | null> = {};
function fakeSpotify() {
  get.mockImplementation(async (_url: string, config: { params: { ids: string } }) => {
    const ids = config.params.ids.split(",");
    return { data: { tracks: ids.map(x => (x in catalogue ? { id: x, external_ids: catalogue[x] === null ? {} : { isrc: catalogue[x] } } : null)) } };
  });
}

async function insert(externalId: string, metadata: unknown, provider = "spotify") {
  await pool.query(
    `INSERT INTO audio_sources (provider, external_id, title, artist, metadata) VALUES ($1, $2, 'Titre', 'Artiste', $3::jsonb)`,
    [provider, externalId, metadata === null ? null : JSON.stringify(metadata)]
  );
}
const metadataOf = async (externalId: string, provider = "spotify") =>
  (await pool.query("SELECT metadata FROM audio_sources WHERE provider = $1 AND external_id = $2", [provider, externalId])).rows[0]?.metadata;

const run = (write: boolean, extra: Partial<Parameters<typeof rattrapageIsrc>[1]> = {}) =>
  rattrapageIsrc(pool, { write, pauseMs: 0, log: () => {}, ...extra });

beforeAll(() => {
  process.env.SPOTIFY_CLIENT_ID = "id-de-test";
  process.env.SPOTIFY_CLIENT_SECRET = "secret-de-test";
});

beforeEach(async () => {
  await pool.query("DELETE FROM audio_sources WHERE external_id LIKE $1", [`${PREFIX}%`]);
  get.mockReset();
  post.mockReset().mockResolvedValue({ data: { access_token: "jeton", expires_in: 3600 } });
  catalogue = {};
});

afterAll(async () => {
  await pool.query("DELETE FROM audio_sources WHERE external_id LIKE $1", [`${PREFIX}%`]);
  await pool.end();
});

async function seedVariety() {
  await insert(id(1), { album: "OST", playlist_id: "3KpbWqSed1fgPwGW39uRJi", import_source: "spotify" });
  await insert(id(2), null);
  await insert(id(3), { album: "B" });
  await insert(id(4), { album: "C", isrc: null }); // cle presente mais vide : a rattraper
  await insert(id(5), { album: "D", isrc: "GBAYE0000001" });
  await insert(id(6), { album: "E" }, "deezer");
  await insert(id(7), { album: "F", isrc: null });
  catalogue = {
    [id(7)]: "FRZZZ0000011",
    [id(1)]: "JPZ921607277",
    [id(2)]: "usrc17607839", // minuscules : normalise en majuscules
    [id(3)]: "pas un isrc",
    // id(4) inconnu de Spotify
    [id(5)]: "FRZZZ0000009",
    [id(6)]: "FRZZZ0000010",
  };
  fakeSpotify();
}

describe("rattrapageIsrc", () => {
  it("essai : compte sans rien ecrire", async () => {
    await seedVariety();
    const totals = await run(false);
    expect(totals).toMatchObject({ traites: 5, isrcTrouves: 3, sansIsrc: 2, erreurs: 0, ecrits: 0 });
    expect(await metadataOf(id(1))).toEqual({ album: "OST", playlist_id: "3KpbWqSed1fgPwGW39uRJi", import_source: "spotify" });
    expect(await metadataOf(id(2))).toBeNull();
  });

  it("ecriture : ajoute seulement isrc et garde les autres cles", async () => {
    await seedVariety();
    const totals = await run(true);
    expect(totals).toMatchObject({ traites: 5, isrcTrouves: 3, sansIsrc: 2, erreurs: 0, ecrits: 3 });
    expect(await metadataOf(id(7))).toEqual({ album: "F", isrc: "FRZZZ0000011" });
    expect(await metadataOf(id(1))).toEqual({ album: "OST", playlist_id: "3KpbWqSed1fgPwGW39uRJi", import_source: "spotify", isrc: "JPZ921607277" });
    expect(await metadataOf(id(2))).toEqual({ isrc: "USRC17607839" });
    expect(await metadataOf(id(3))).toEqual({ album: "B" }); // ISRC mal forme : rien
    expect(await metadataOf(id(4))).toEqual({ album: "C", isrc: null }); // inconnu : rien
    expect(await metadataOf(id(5))).toEqual({ album: "D", isrc: "GBAYE0000001" }); // jamais remplace
    expect(await metadataOf(id(6), "deezer")).toEqual({ album: "E" }); // Deezer : pas touche
  });

  it("reprenable : une relance ne reprend que les morceaux encore sans ISRC", async () => {
    await seedVariety();
    await run(true);
    get.mockClear();
    const again = await run(true);
    expect(again).toMatchObject({ traites: 2, isrcTrouves: 0, ecrits: 0 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1].params.ids.split(",").sort()).toEqual([id(3), id(4)]);
  });

  it("lots de 50 ids au plus, et --lots arrete au bon moment", async () => {
    for (let i = 1; i <= 120; i++) {
      await insert(id(i), { n: i });
      catalogue[id(i)] = `FRZZZ${String(i).padStart(7, "0")}`;
    }
    fakeSpotify();
    const partial = await run(true, { maxBatches: 2 });
    expect(partial).toMatchObject({ traites: 100, ecrits: 100 });
    expect(get.mock.calls.map(c => c[1].params.ids.split(",").length)).toEqual([50, 50]);
    const rest = await run(true);
    expect(rest).toMatchObject({ traites: 20, ecrits: 20 });
    expect(await metadataOf(id(120))).toEqual({ n: 120, isrc: "FRZZZ0000120" });
  });

  it("429 : attend Retry-After puis reprend le meme lot", async () => {
    await seedVariety();
    get.mockReset();
    get.mockRejectedValueOnce({ isAxiosError: true, message: "Too Many Requests", response: { status: 429, headers: { "retry-after": "1" } } });
    fakeSpotify();
    const started = Date.now();
    const totals = await run(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(totals).toMatchObject({ ecrits: 3, erreurs: 0 });
  });

  it("Retry-After trop long : arret propre, rien d'ecrit, a relancer plus tard", async () => {
    await seedVariety();
    get.mockReset().mockRejectedValue({ isAxiosError: true, message: "Too Many Requests", response: { status: 429, headers: { "retry-after": "3600" } } });
    const totals = await run(true);
    expect(totals.arretAnticipe).toMatch(/relancer plus tard/);
    expect(totals).toMatchObject({ ecrits: 0, erreurs: 5 });
    expect(await metadataOf(id(1))).not.toHaveProperty("isrc");
  });

  it("panne Spotify sur un lot : compte en erreur, ne montre jamais le jeton", async () => {
    await seedVariety();
    get.mockReset().mockRejectedValue({ isAxiosError: true, message: "Request failed with status code 500", response: { status: 500 }, config: { headers: { Authorization: "Bearer jeton" } } });
    const lines: string[] = [];
    const totals = await run(true, { log: l => lines.push(l) });
    expect(totals).toMatchObject({ erreurs: 5, ecrits: 0 });
    expect(lines.join("\n")).not.toContain("jeton");
  }, 15_000);
});

// Attentes simulees : on compte le temps demande sans l'attendre pour de vrai.
function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => { waits.push(ms); } };
}
const tooMany = (retryAfter: string) => ({ isAxiosError: true, message: "Too Many Requests", response: { status: 429, headers: { "retry-after": retryAfter } } });

describe("rattrapageIsrc, garde-fous", () => {
  it("429 sans fin : arret propre apres 5 reponses 429, en moins de 2 s", async () => {
    await seedVariety();
    get.mockReset().mockRejectedValue(tooMany("1"));
    const clock = fakeSleep();
    const started = Date.now();
    const totals = await run(true, { sleep: clock.sleep });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(get).toHaveBeenCalledTimes(5);
    expect(totals.arretAnticipe).toMatch(/relancer plus tard/);
    expect(totals.ecrits).toBe(0);
  });

  it("Retry-After negatif ou nul : au moins 1 s d'attente, jamais de boucle serree", async () => {
    await seedVariety();
    get.mockReset().mockRejectedValueOnce(tooMany("-3")).mockRejectedValueOnce(tooMany("0"));
    fakeSpotify();
    const clock = fakeSleep();
    const totals = await run(true, { sleep: clock.sleep });
    expect(clock.waits.slice(0, 2)).toEqual([1_000, 1_000]);
    expect(totals.ecrits).toBe(3);
  });

  it("5 lots en erreur d'affilee : arret", async () => {
    for (let i = 1; i <= 300; i++) await insert(id(i), {});
    get.mockReset().mockRejectedValue({ isAxiosError: true, message: "Request failed with status code 503", response: { status: 503 } });
    const clock = fakeSleep();
    const totals = await run(true, { sleep: clock.sleep });
    expect(totals).toMatchObject({ traites: 250, erreurs: 250, ecrits: 0 });
    expect(totals.arretAnticipe).toMatch(/5 lots en erreur/);
  });

  it("un morceau renvoye sous un autre id n'est jamais ecrit", async () => {
    await seedVariety();
    get.mockReset().mockImplementation(async (_url: string, config: { params: { ids: string } }) => ({
      data: { tracks: config.params.ids.split(",").map((x, i) => ({ id: i === 0 ? "AutreIdSpotify00000000" : x, external_ids: { isrc: catalogue[x] ?? undefined } })) },
    }));
    const totals = await run(true);
    expect(await metadataOf(id(1))).not.toHaveProperty("isrc"); // id(1) est le premier du lot
    expect(totals.ecrits).toBe(2);
  });

  it("--lots 1 : une seule requete pour un premier essai", async () => {
    expect(parseArgs(["--lots", "1"])).toEqual({ write: false, maxBatches: 1 });
    expect(parseArgs(["--ecrire"])).toEqual({ write: true, maxBatches: undefined });
    expect(() => parseArgs(["--lots", "0"])).toThrow();
    for (let i = 1; i <= 120; i++) await insert(id(i), {});
    fakeSpotify();
    await run(false, { maxBatches: 1 });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("strictIsrc", () => {
  it("valide strictement le format", () => {
    expect(strictIsrc("JPZ921607277")).toBe("JPZ921607277");
    expect(strictIsrc(" usrc17607839 ")).toBe("USRC17607839");
    expect(strictIsrc("JPZ92160727")).toBeNull();
    expect(strictIsrc("JP-Z92-16-07277")).toBeNull();
    expect(strictIsrc(null)).toBeNull();
  });
});
