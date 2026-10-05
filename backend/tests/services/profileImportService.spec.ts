import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Lecture des titres d'une playlist chez Deezer et Spotify. Ce qui compte ici :
// que l'import en masse sache distinguer une playlist vide, une playlist en
// erreur et un fournisseur qui demande de ralentir (il doit alors s'arreter).
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from "axios";
import { fetchPlaylistTracks } from "../../src/services/profileImportService";
import { ProviderRateLimitedError, isProviderRateLimited } from "../../src/services/providerBudget";

const get = axios.get as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const post = axios.post as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const titreDeezer = (id: number) => ({ id, title: `Titre ${id}`, artist: { name: "Artiste" }, album: { title: "Album" }, duration: 200 });
const erreurHttp = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("fetchPlaylistTracks Deezer", () => {
  it("renvoie les titres de la premiere page", async () => {
    get.mockResolvedValueOnce({ data: { data: [titreDeezer(1), titreDeezer(2)], next: null } });
    const titres = await fetchPlaylistTracks("deezer", "111", 50);
    expect(titres.map(t => t.externalId)).toEqual(["1", "2"]);
  });

  it("une playlist privee ou supprimee (erreur Deezer ordinaire) reste une playlist vide", async () => {
    get.mockResolvedValueOnce({ data: { error: { type: "DataException", message: "no data", code: 800 } } });
    await expect(fetchPlaylistTracks("deezer", "111", 50)).resolves.toEqual([]);
  });

  it("le quota de Deezer (code 4) leve ProviderRateLimitedError", async () => {
    get.mockResolvedValueOnce({ data: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } });
    const erreur = await fetchPlaylistTracks("deezer", "111", 50).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ProviderRateLimitedError);
  });

  it("un 429 HTTP de Deezer leve une erreur reconnue comme limite de debit", async () => {
    get.mockRejectedValueOnce(erreurHttp(429));
    const erreur = await fetchPlaylistTracks("deezer", "111", 50).catch((e: unknown) => e);
    expect(isProviderRateLimited(erreur)).toBe(true);
  });

  it("une panne sur la premiere page n'est plus prise pour une playlist vide", async () => {
    get.mockRejectedValueOnce(erreurHttp(403));
    await expect(fetchPlaylistTracks("deezer", "111", 50)).rejects.toThrow("403");
  });

  it("une panne sur une page suivante garde les titres deja lus", async () => {
    get
      .mockResolvedValueOnce({ data: { data: [titreDeezer(1)], next: "https://api.deezer.com/playlist/111/tracks?index=1" } })
      .mockRejectedValueOnce(erreurHttp(500));
    const titres = await fetchPlaylistTracks("deezer", "111", 300);
    expect(titres.map(t => t.externalId)).toEqual(["1"]);
  });
});

describe("fetchPlaylistTracks Spotify", () => {
  beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = "id-de-test";
    process.env.SPOTIFY_CLIENT_SECRET = "secret-de-test";
    post.mockResolvedValue({ data: { access_token: "jeton", expires_in: 3600 } });
  });

  it("un 429 de Spotify leve une erreur reconnue comme limite de debit", async () => {
    get.mockRejectedValueOnce(erreurHttp(429));
    const erreur = await fetchPlaylistTracks("spotify", "37i9dQZF1DXcBWIGoYBM5M", 50).catch((e: unknown) => e);
    expect(isProviderRateLimited(erreur)).toBe(true);
  });
});
