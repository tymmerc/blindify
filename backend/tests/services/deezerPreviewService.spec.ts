// Recherche d'extraits sur Deezer. Le 02/10/2026, la recherche avancee de
// Deezer (`track:"..." artist:"..."`) s'est mise a renvoyer 0 resultat (le
// filtre artist est casse chez eux) : plus aucun extrait trouve, le solo par
// lien refusait de demarrer ("Pas assez de titres avec extrait audio").
// On cherche donc en texte libre, et on ne garde QUE le bon morceau : jouer un
// autre titre que celui affiche fausserait la reponse de la manche.
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from "axios";
import { DeezerPreviewService } from "../../src/services/deezerPreviewService";

const get = axios.get as jest.Mock;
const item = (id: number, title: string, artist: string, preview = `https://cdn.example/${id}.mp3`) =>
  ({ id, title, artist: { name: artist }, preview, album: { cover_big: null }, duration: 200 });

beforeEach(() => get.mockReset());

describe("DeezerPreviewService.searchTrack", () => {
  it("cherche en texte libre, sans la syntaxe avancee cassee chez Deezer", async () => {
    get.mockResolvedValue({ data: { data: [item(1, "Starboy", "The Weeknd")] } });
    await new DeezerPreviewService().searchTrack("Starboy", "The Weeknd");
    const q = get.mock.calls[0][1].params.q as string;
    expect(q).not.toMatch(/artist:|track:/);
    expect(q).toContain("Starboy");
    expect(q).toContain("The Weeknd");
  });

  it("garde le morceau dont le titre et l'artiste correspondent, avec un extrait", async () => {
    get.mockResolvedValue({ data: { data: [
      item(1, "Starboy (Kygo Remix)", "Kygo"),
      item(2, "Starboy", "The Weeknd", ""),
      item(3, "Starboy", "The Weeknd"),
    ] } });
    const t = await new DeezerPreviewService().searchTrack("Starboy", "The Weeknd");
    expect(t?.id).toBe(3);
    expect(t?.preview).toBe("https://cdn.example/3.mp3");
  });

  it("tolere accents, casse et mentions entre parentheses", async () => {
    get.mockResolvedValue({ data: { data: [item(7, "Je veux (Remasterisé 2020)", "ZAZ")] } });
    const t = await new DeezerPreviewService().searchTrack("je veux", "Zaz");
    expect(t?.id).toBe(7);
  });

  it("ne renvoie jamais un autre morceau que celui demande", async () => {
    get.mockResolvedValue({ data: { data: [item(9, "Scarborough Fair", "Simon & Garfunkel")] } });
    const t = await new DeezerPreviewService().searchTrack("Starboy", "The Weeknd");
    expect(t).toBeNull();
  });

  it("accepte le bon titre meme si l'artiste est ecrit autrement (featuring)", async () => {
    get.mockResolvedValue({ data: { data: [item(4, "Blinding Lights", "The Weeknd")] } });
    const t = await new DeezerPreviewService().searchTrack("Blinding Lights", "The Weeknd, Rosalia");
    expect(t?.id).toBe(4);
  });

  it("cherche sans les mentions de version, qui brouillent la recherche de Deezer", async () => {
    get.mockResolvedValue({ data: { data: [item(5, "Bohemian Rhapsody (Remastered 2011)", "Queen")] } });
    const t = await new DeezerPreviewService().searchTrack("Bohemian Rhapsody - Remastered 2011", "Queen");
    expect(get.mock.calls[0][1].params.q).toBe("Bohemian Rhapsody Queen");
    expect(t?.id).toBe(5);
  });
});

// Un morceau Spotify porte son ISRC (identifiant de l'enregistrement). Deezer
// le retrouve directement : /track/isrc:<ISRC> renvoie exactement le meme
// enregistrement, sans passer par une recherche de titre.
describe("DeezerPreviewService.resolvePreview", () => {
  // Reponse reelle de Deezer pour l'ISRC de "You Say Run" (07/10/2026).
  const youSayRun = {
    id: 3758443092, title: "You Say Run", isrc: "JPZ921607277", readable: true, duration: 228,
    preview: "https://cdn.example/3758443092.mp3", artist: { name: "林　ゆうき" }, album: { cover_big: "https://cdn.example/c.jpg" },
  };
  const earth2021 = item(1265507122, "You Say Run (Earth-2021)", "Yuki Hayashi");

  it("prend l'enregistrement exact par ISRC, sans recherche", async () => {
    get.mockResolvedValueOnce({ data: youSayRun });
    const t = await new DeezerPreviewService().resolvePreview({ title: "You Say Run", artist: "Yuki Hayashi", isrc: "JPZ921607277", durationMs: 228746 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toMatch(/\/track\/isrc:JPZ921607277$/);
    expect(t?.id).toBe(3758443092);
    expect(t?.preview).toBe("https://cdn.example/3758443092.mp3");
  });

  it("ISRC inconnu de Deezer : repli sur la recherche, qui refuse les autres versions", async () => {
    get
      .mockResolvedValueOnce({ data: { error: { type: "DataException", message: "no data", code: 800 } } })
      .mockResolvedValueOnce({ data: { data: [earth2021] } });
    const t = await new DeezerPreviewService().resolvePreview({ title: "You Say Run", artist: "Yuki Hayashi", isrc: "JPZ921607277", durationMs: 228746 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][0]).toMatch(/\/search$/);
    expect(t).toBeNull();
  });

  it("ISRC trouve mais sans extrait : repli sur la recherche", async () => {
    get
      .mockResolvedValueOnce({ data: { ...youSayRun, preview: "" } })
      .mockResolvedValueOnce({ data: { data: [item(8, "You Say Run", "Yuki Hayashi")] } });
    const t = await new DeezerPreviewService().resolvePreview({ title: "You Say Run", artist: "Yuki Hayashi", isrc: "JPZ921607277" });
    expect(t?.id).toBe(8);
  });

  it("erreur reseau sur l'ISRC : repli sur la recherche", async () => {
    get
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ data: { data: [item(8, "You Say Run", "Yuki Hayashi")] } });
    const t = await new DeezerPreviewService().resolvePreview({ title: "You Say Run", artist: "Yuki Hayashi", isrc: "JPZ921607277" });
    expect(t?.id).toBe(8);
  });

  it("n'envoie jamais un ISRC mal forme dans l'URL", async () => {
    get.mockResolvedValueOnce({ data: { data: [] } });
    await new DeezerPreviewService().resolvePreview({ title: "You Say Run", artist: "Yuki Hayashi", isrc: "../../user/1" });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toMatch(/\/search$/);
  });

  it("morceau Deezer : extrait pris par son identifiant, sans recherche", async () => {
    get.mockResolvedValueOnce({ data: { ...youSayRun, id: 1265507122, title: "You Say Run (Earth-2021)" } });
    const t = await new DeezerPreviewService().resolvePreview({ title: "You Say Run (Earth-2021)", artist: "Yuki Hayashi", deezerId: "1265507122" });
    expect(get.mock.calls[0][0]).toMatch(/\/track\/1265507122$/);
    expect(t?.id).toBe(1265507122);
  });

  it("garde en cache le resultat par ISRC (un seul appel)", async () => {
    get.mockResolvedValue({ data: youSayRun });
    const svc = new DeezerPreviewService();
    await svc.resolvePreview({ title: "You Say Run", isrc: "JPZ921607277" });
    await svc.resolvePreview({ title: "You Say Run", isrc: "jpz921607277" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("la recherche departage par la duree de la source", async () => {
    get.mockResolvedValueOnce({ data: { data: [
      { ...item(1, "Song", "A"), duration: 300 },
      { ...item(2, "Song", "A"), duration: 201 },
    ] } });
    const t = await new DeezerPreviewService().resolvePreview({ title: "Song", artist: "A", durationMs: 200000 });
    expect(t?.id).toBe(2);
  });
});
