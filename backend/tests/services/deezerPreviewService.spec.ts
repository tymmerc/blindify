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
