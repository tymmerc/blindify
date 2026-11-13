// T35 : lien frais d'une manche a venir (roundPreviews.freshPreview).
const query = jest.fn();
jest.mock("../../src/config/db", () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
const hydratePreviewOutcome = jest.fn();
jest.mock("../../src/services/trackResolution", () => ({
  hydratePreviewOutcome: (...args: unknown[]) => hydratePreviewOutcome(...args),
}));

import { freshPreview, previewNeedsRefresh } from "../../src/services/roundPreviews";
import { PREVIEW_MIN_VALIDITY_MS } from "../../src/utils/previewExpiry";

const link = (msFromNow: number) => `https://cdnt-preview.dzcdn.net/x.mp3?hdnea=exp=${Math.floor((Date.now() + msFromNow) / 1000)}~hmac=y`;
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const row = { id: ID, provider: "deezer", external_id: "3135556", title: "Harder", artist: "Daft Punk", album_cover: null, audio_url: null, duration_ms: null, metadata: null };

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [row] });
  hydratePreviewOutcome.mockReset().mockResolvedValue({ url: link(15 * 60_000), failed: false });
});

describe("previewNeedsRefresh", () => {
  it("vise les liens qui meurent dans moins de 5 min, pas les liens sans signature", () => {
    expect(previewNeedsRefresh(link(4 * 60_000))).toBe(true);
    expect(previewNeedsRefresh(link(10 * 60_000))).toBe(false);
    expect(previewNeedsRefresh("https://extraits.test/1.mp3")).toBe(false);
    expect(previewNeedsRefresh(null)).toBe(false);
  });
});

describe("freshPreview", () => {
  it("relit le morceau en base et exige 5 min de validite au lien stocke", async () => {
    const url = await freshPreview(ID);
    expect(url).toContain("hdnea=exp=");
    expect(query.mock.calls[0][1]).toEqual([ID]);
    expect(hydratePreviewOutcome).toHaveBeenCalledWith(row, undefined, PREVIEW_MIN_VALIDITY_MS);
  });

  it("une seule recherche quand toute la table redemande le meme morceau", async () => {
    const all = await Promise.all([freshPreview(ID), freshPreview(ID.toUpperCase()), freshPreview(ID)]);
    expect(new Set(all).size).toBe(1);
    expect(hydratePreviewOutcome).toHaveBeenCalledTimes(1);
  });

  it("rend null sans planter : id invalide, morceau absent, Deezer en erreur, base en panne", async () => {
    expect(await freshPreview("quick-123")).toBeNull();
    expect(await freshPreview(7)).toBeNull();
    expect(await freshPreview(undefined)).toBeNull();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rows: [] });
    expect(await freshPreview(ID.replace(/b$/, "c"))).toBeNull();
    hydratePreviewOutcome.mockResolvedValueOnce({ url: null, failed: true });
    expect(await freshPreview(ID.replace(/b$/, "d"))).toBeNull();
    query.mockRejectedValueOnce(new Error("pool epuise"));
    expect(await freshPreview(ID.replace(/b$/, "e"))).toBeNull();
  });
});
