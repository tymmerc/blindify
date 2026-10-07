// Les extraits Deezer stockes expirent (~15 min) et sont re-resolus a chaque
// partie : c'est ici que l'ISRC (Spotify) ou l'identifiant Deezer doivent etre
// transmis, sinon on retombe sur une recherche de titre.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/services/deezerPreviewService", () => ({
  deezerPreviewService: { resolvePreviewOutcome: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { deezerPreviewService } from "../../src/services/deezerPreviewService";
import { hydratePreviewUrl, previewQueryFor, collectPlayableSources } from "../../src/services/trackResolution";
import type { AudioSourceRow } from "../../src/types/audio";

const query = pool.query as jest.Mock;
const resolvePreview = deezerPreviewService.resolvePreviewOutcome as jest.Mock;
const found = (preview: string) => ({ status: "found", track: { id: 1, preview } });

const source = (over: Partial<AudioSourceRow>): AudioSourceRow => ({
  id: "s1", provider: "spotify", external_id: "0hHc2igYYlSUyZdByauJmB", title: "You Say Run", artist: "Yuki Hayashi",
  album_cover: null, audio_url: null, duration_ms: 228746, metadata: { isrc: "JPZ921607277" }, ...over,
});

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  resolvePreview.mockReset();
});

describe("previewQueryFor", () => {
  it("Spotify : titre, artiste, duree et ISRC", () => {
    expect(previewQueryFor(source({}))).toEqual({
      title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746, isrc: "JPZ921607277", deezerId: null,
    });
  });

  it("Deezer : l'identifiant du morceau, s'il est numerique", () => {
    expect(previewQueryFor(source({ provider: "deezer", external_id: "1265507122", metadata: {} })).deezerId).toBe("1265507122");
    expect(previewQueryFor(source({ provider: "deezer", external_id: "test-3-1", metadata: {} })).deezerId).toBeNull();
  });

  it("ignore un ISRC absent ou mal forme", () => {
    expect(previewQueryFor(source({ metadata: null })).isrc).toBeNull();
    expect(previewQueryFor(source({ metadata: { isrc: 12 } })).isrc).toBeNull();
  });
});

describe("hydratePreviewUrl", () => {
  it("re-resout un extrait expire avec l'ISRC et le stocke", async () => {
    resolvePreview.mockResolvedValue(found("https://cdn.example/bon.mp3"));
    const url = await hydratePreviewUrl(source({ audio_url: "https://cdn.example/earth.mp3?hdnea=exp=1700000000~acl" }));
    expect(resolvePreview).toHaveBeenCalledWith(expect.objectContaining({ isrc: "JPZ921607277", durationMs: 228746 }));
    expect(url).toBe("https://cdn.example/bon.mp3");
    expect(query).toHaveBeenCalledWith("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", ["https://cdn.example/bon.mp3", "s1"]);
  });

  it("aucune version sure : l'extrait expire est efface, le morceau sera saute", async () => {
    resolvePreview.mockResolvedValue({ status: "none" });
    const url = await hydratePreviewUrl(source({ audio_url: "https://cdn.example/earth.mp3?hdnea=exp=1700000000~acl" }));
    expect(url).toBeNull();
    expect(query).toHaveBeenCalledWith("UPDATE audio_sources SET audio_url=NULL WHERE id=$1", ["s1"]);
  });

  it("Deezer en erreur : rien n'est ecrit en base (l'extrait n'est pas efface)", async () => {
    resolvePreview.mockResolvedValue({ status: "error" });
    const url = await hydratePreviewUrl(source({ audio_url: "https://cdn.example/earth.mp3?hdnea=exp=1700000000~acl" }));
    expect(url).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("exception pendant la resolution : rien n'est ecrit non plus", async () => {
    resolvePreview.mockRejectedValue(new Error("boom"));
    expect(await hydratePreviewUrl(source({ audio_url: "https://cdn.example/earth.mp3?hdnea=exp=1700000000~acl" }))).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("garde un extrait encore valide sans appeler Deezer", async () => {
    const valid = `https://cdn.example/x.mp3?hdnea=exp=${Math.floor(Date.now() / 1000) + 600}~acl`;
    expect(await hydratePreviewUrl(source({ audio_url: valid }))).toBe(valid);
    expect(resolvePreview).not.toHaveBeenCalled();
  });
});

describe("collectPlayableSources", () => {
  it("hydrate par tranches de 6 et s'arrete des qu'il y a assez de morceaux jouables", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => source({ id: `s${i}`, external_id: `ext${i}`, audio_url: null }));
    query.mockResolvedValueOnce({ rows }).mockResolvedValue({ rows: [] });
    let inFlight = 0;
    let peak = 0;
    resolvePreview.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return found("https://cdn.example/ok.mp3");
    });
    const got = await collectPlayableSources(1, 5, {});
    expect(resolvePreview).toHaveBeenCalledTimes(6); // une tranche suffit pour 5 morceaux
    expect(peak).toBeLessThanOrEqual(6);
    expect(got).toHaveLength(5);
  });

  it("continue tranche apres tranche tant qu'il manque des morceaux", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => source({ id: `s${i}`, external_id: `ext${i}`, audio_url: null }));
    query.mockResolvedValueOnce({ rows }).mockResolvedValue({ rows: [] });
    let n = 0;
    // Un morceau sur deux seulement a une version sure.
    resolvePreview.mockImplementation(async () => (n++ % 2 === 0 ? found("https://cdn.example/ok.mp3") : { status: "none" }));
    const got = await collectPlayableSources(1, 5, {});
    expect(got).toHaveLength(5);
    expect(resolvePreview).toHaveBeenCalledTimes(12); // 2 tranches : 3 + 3 jouables
  });

  it("les extraits encore valides comptent sans appeler Deezer", async () => {
    const valid = `https://cdn.example/x.mp3?hdnea=exp=${Math.floor(Date.now() / 1000) + 600}~acl`;
    const rows = Array.from({ length: 8 }, (_, i) => source({ id: `s${i}`, external_id: `ext${i}`, audio_url: valid.replace("x.mp3", `x${i}.mp3`) }));
    query.mockResolvedValueOnce({ rows }).mockResolvedValue({ rows: [] });
    const got = await collectPlayableSources(1, 5, {});
    expect(got).toHaveLength(5);
    expect(resolvePreview).not.toHaveBeenCalled();
  });
});
