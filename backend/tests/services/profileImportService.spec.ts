// Import d'une playlist Spotify : on demande aussi l'ISRC de chaque morceau
// (dans la meme requete, aucun appel de plus). C'est lui qui permet de trouver
// sur Deezer l'extrait du bon enregistrement, et pas une autre version.
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from "axios";
import { fetchPlaylistTracks } from "../../src/services/profileImportService";

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
