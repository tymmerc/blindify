// Import d'une playlist Spotify : on demande aussi l'ISRC de chaque morceau
// (dans la meme requete, aucun appel de plus). C'est lui qui permet de trouver
// sur Deezer l'extrait du bon enregistrement, et pas une autre version.
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from "axios";
import { fetchPlaylistTracks, fetchPlaylistTracksChecked, fetchPublicPlaylists } from "../../src/services/profileImportService";

const get = axios.get as jest.Mock;
const post = axios.post as jest.Mock;

beforeAll(() => {
  process.env.SPOTIFY_CLIENT_ID = "id-de-test";
  process.env.SPOTIFY_CLIENT_SECRET = "secret-de-test";
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  post.mockResolvedValue({ data: { access_token: "jeton", expires_in: 3600 } });
});

describe("fetchPlaylistTracks (Spotify)", () => {
  it("demande l'ISRC dans les champs de la requete et le garde sur le morceau", async () => {
    get.mockResolvedValueOnce({ data: { next: null, items: [
      { track: { id: "0hHc2igYYlSUyZdByauJmB", name: "You Say Run", artists: [{ name: "Yuki Hayashi" }], album: { name: "OST", images: [] }, duration_ms: 228746, external_ids: { isrc: "JPZ921607277" } } },
      { track: { id: "sansIsrc", name: "Autre", artists: [{ name: "A" }], album: { name: "B" }, duration_ms: 1000 } },
    ] } });

    const tracks = await fetchPlaylistTracks("spotify", "3KpbWqSed1fgPwGW39uRJi", 10);

    const url = get.mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain("fields=items(track(id,name,artists,album,duration_ms,external_ids(isrc))),next");
    expect(tracks[0]).toMatchObject({ externalId: "0hHc2igYYlSUyZdByauJmB", isrc: "JPZ921607277", durationMs: 228746 });
    expect(tracks[1].isrc).toBeNull();
  });

  it("ignore un ISRC mal forme renvoye par l'API", async () => {
    get.mockResolvedValueOnce({ data: { next: null, items: [
      { track: { id: "x", name: "T", artists: [], album: {}, duration_ms: 1, external_ids: { isrc: "pas un isrc" } } },
    ] } });
    const tracks = await fetchPlaylistTracks("spotify", "3KpbWqSed1fgPwGW39uRJi", 10);
    expect(tracks[0].isrc).toBeNull();
  });
});

describe("jeton client Spotify", () => {
  it("la demande de jeton a un delai maximal (10 s)", async () => {
    jest.resetModules();
    const fresh = jest.requireActual("../../src/services/profileImportService") as typeof import("../../src/services/profileImportService");
    const freshAxios = (jest.requireMock("axios") as { default: { post: jest.Mock } }).default;
    freshAxios.post.mockResolvedValue({ data: { access_token: "jeton", expires_in: 3600 } });
    await fresh.getSpotifyClientToken();
    expect(freshAxios.post.mock.calls[0][2]).toMatchObject({ timeout: 10_000 });
  });

  // T15 : l'import par lien n'a besoin d'aucun compte Spotify connecte.
  it("est un jeton de l'appli (client credentials), jamais celui d'un joueur", async () => {
    jest.resetModules();
    const fresh = jest.requireActual("../../src/services/profileImportService") as typeof import("../../src/services/profileImportService");
    const freshAxios = (jest.requireMock("axios") as { default: { post: jest.Mock } }).default;
    freshAxios.post.mockResolvedValue({ data: { access_token: "jeton", expires_in: 3600 } });
    await fresh.getSpotifyClientToken();
    const [url, body] = freshAxios.post.mock.calls[0];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(new URLSearchParams(body).get("grant_type")).toBe("client_credentials");
    expect(new URLSearchParams(body).has("refresh_token")).toBe(false);
  });
});

// T37 : une playlist Deezer de joueur de 200 morceaux ne doit pas s'arreter a
// une page, et l'import doit savoir s'il a tout lu (sinon il ne retire rien
// de la carte au reimport).
describe("fetchPlaylistTracksChecked (Deezer)", () => {
  const page = (from: number, count: number, next: string | null) => ({ data: {
    next,
    data: Array.from({ length: count }, (_, i) => ({ id: from + i, title: `T${from + i}`, artist: { name: "A" }, album: { title: "B" }, duration: 30 })),
  } });

  it("lit toutes les pages : 230 morceaux", async () => {
    get
      .mockResolvedValueOnce(page(1, 100, "https://api.deezer.com/playlist/9/tracks?index=100"))
      .mockResolvedValueOnce(page(101, 100, "https://api.deezer.com/playlist/9/tracks?index=200"))
      .mockResolvedValueOnce(page(201, 30, null));
    const { tracks, complete } = await fetchPlaylistTracksChecked("deezer", "9", 500);
    expect(tracks).toHaveLength(230);
    expect(complete).toBe(true);
  });

  it("une page en echec : ce qui a ete lu, marque incomplet", async () => {
    get
      .mockResolvedValueOnce(page(1, 100, "https://api.deezer.com/playlist/9/tracks?index=100"))
      .mockRejectedValueOnce(new Error("timeout of 15000ms exceeded"));
    const { tracks, complete } = await fetchPlaylistTracksChecked("deezer", "9", 500);
    expect(tracks).toHaveLength(100);
    expect(complete).toBe(false);
  });

  it("Deezer repond une erreur (quota) : incomplet", async () => {
    get
      .mockResolvedValueOnce(page(1, 100, "https://api.deezer.com/playlist/9/tracks?index=100"))
      .mockResolvedValueOnce({ data: { error: { code: 4, message: "Quota limit exceeded" } } });
    expect((await fetchPlaylistTracksChecked("deezer", "9", 500)).complete).toBe(false);
  });

  it("coupe a la limite demandee, sans se dire incomplet", async () => {
    get.mockResolvedValueOnce(page(1, 50, "https://api.deezer.com/playlist/9/tracks?index=50"));
    const { tracks, complete } = await fetchPlaylistTracksChecked("deezer", "9", 50);
    expect(tracks).toHaveLength(50);
    expect(complete).toBe(true);
  });
});

// T37 : le 12/11, Spotify repondait 503 ou trop lentement sur la fiche de la
// playlist. Le repli cherchait alors une playlist du meme nom chez Deezer (celle
// d'un inconnu) et la rendait sous le fournisseur « spotify » : l'import des
// titres partait chez Spotify avec un identifiant Deezer et finissait en 400.
describe("fetchPublicPlaylists : fiche Spotify indisponible", () => {
  const parsed = { provider: "spotify" as const, type: "playlist" as const, id: "37i9dQZF1DXcBWIGoYBM5M" };

  it("503 : on garde la playlist du joueur, jamais une playlist Deezer d'un inconnu", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.spotify.com/v1/playlists/")) throw Object.assign(new Error("503"), { response: { status: 503 } });
      if (url === "https://open.spotify.com/oembed") return { data: { title: "Ma playlist" } };
      return { data: { data: [{ id: 999, title: "Une autre", nb_tracks: 20 }] } };
    });
    const playlists = await fetchPublicPlaylists(parsed);
    expect(playlists).toEqual([{ id: parsed.id, name: "Ma playlist", trackCount: 0, cover: null }]);
    expect(get.mock.calls.some(([url]) => String(url).includes("deezer"))).toBe(false);
  });

  it("delai depasse, sans nom : la playlist du joueur quand meme", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.spotify.com/v1/playlists/")) throw Object.assign(new Error("timeout of 10000ms exceeded"), { code: "ECONNABORTED" });
      throw new Error("oembed muet");
    });
    expect(await fetchPublicPlaylists(parsed)).toEqual([{ id: parsed.id, name: "Playlist", trackCount: 0, cover: null }]);
  });

  it("404 (privee ou supprimee) : aucune playlist", async () => {
    get.mockImplementation(async () => {
      throw Object.assign(new Error("404"), { response: { status: 404 } });
    });
    expect(await fetchPublicPlaylists(parsed)).toEqual([]);
  });
});
