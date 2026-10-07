/**
 * Complement des manches (roundTopUp.ts), sans base : les bibliotheques sont
 * simulees par un tirage en memoire.
 */
import type { AudioSourceRow } from "../../src/types/audio";
import type { PlayableBatch } from "../../src/services/trackResolution";
import { TOP_UP_MAX_PASSES, topUpPlayable, type DrawFromPlayer } from "../../src/services/roundTopUp";

function row(owner: number, n: number, playable: boolean): AudioSourceRow & { playable: boolean } {
  return {
    id: `${owner}-${n}`,
    user_id: owner,
    provider: "deezer",
    external_id: `${owner}-${n}`,
    title: `t${n}`,
    artist: "a",
    album_cover: null,
    audio_url: playable ? `https://x.test/${owner}-${n}.mp3` : null,
    duration_ms: null,
    metadata: null,
    playable,
  };
}

/** Bibliotheques en memoire : `libraries[userId]` = [jouables, muets]. */
function fakeLibraries(libraries: Record<number, [number, number]>) {
  const rows = new Map<number, Array<ReturnType<typeof row>>>();
  for (const [owner, [playable, mute]] of Object.entries(libraries)) {
    const id = Number(owner);
    rows.set(id, [
      ...Array.from({ length: playable }, (_, i) => row(id, i, true)),
      ...Array.from({ length: mute }, (_, i) => row(id, 1000 + i, false)),
    ]);
  }
  const calls: Array<{ userId: number; drawLimit: number }> = [];
  const draw: DrawFromPlayer = async (userId, drawLimit, excludeKeys) => {
    calls.push({ userId, drawLimit });
    const excluded = new Set(excludeKeys);
    const drawn = (rows.get(userId) ?? []).filter(r => !excluded.has(r.external_id!)).slice(0, drawLimit);
    const batch: PlayableBatch = {
      playable: drawn.filter(r => r.playable),
      rejectedKeys: drawn.filter(r => !r.playable).map(r => r.external_id!),
      drawn: drawn.length,
      lookups: drawn.length,
    };
    return batch;
  };
  return { draw, calls };
}

describe("topUpPlayable", () => {
  it("complete jusqu'a la cible depuis les bibliotheques des joueurs", async () => {
    const { draw } = fakeLibraries({ 1: [30, 20] });
    const current = [row(1, 0, true), row(1, 1, true)];

    const result = await topUpPlayable({ current, target: 10, contributorIds: [1, 2], rejectedKeys: new Set(), draw });

    expect(result.sources.length).toBeGreaterThanOrEqual(10);
    expect(new Set(result.sources.map(s => s.external_id)).size).toBe(result.sources.length);
    expect(current).toHaveLength(2); // l'entree n'est pas modifiee
  });

  it("le joueur qui a le moins de titres tire en premier", async () => {
    const { draw, calls } = fakeLibraries({ 1: [30, 0], 2: [30, 0] });
    const current = Array.from({ length: 6 }, (_, i) => row(1, 100 + i, true));

    await topUpPlayable({ current, target: 10, contributorIds: [1, 2], rejectedKeys: new Set(), draw });

    expect(calls[0].userId).toBe(2);
  });

  it("un joueur a sec laisse sa part du tirage a l'autre", async () => {
    const { draw, calls } = fakeLibraries({ 1: [30, 0] });

    const result = await topUpPlayable({ current: [], target: 10, contributorIds: [2, 1], rejectedKeys: new Set(), draw });

    // Il manque 10 titres : 30 tires au plus dans la passe, partages entre les deux.
    expect(calls.map(c => [c.userId, c.drawLimit])).toEqual([[2, 15], [1, 30]]);
    expect(result.sources).toHaveLength(10);
    expect(result.sources.every(s => s.user_id === 1)).toBe(true);
  });

  it("borne : au plus deux passes, chacune tire au plus 3 fois le manque", async () => {
    const { draw, calls } = fakeLibraries({ 1: [1, 500] });
    const current = Array.from({ length: 16 }, (_, i) => row(1, 2000 + i, true));

    const result = await topUpPlayable({ current, target: 20, contributorIds: [1], rejectedKeys: new Set(), draw });

    expect(result.passes).toBe(TOP_UP_MAX_PASSES);
    // Il manque 4 titres : 12 tires au plus a la 1re passe, 3 x 3 a la 2e.
    expect(calls.map(c => c.drawLimit)).toEqual([12, 9]);
    expect(result.drawn).toBeLessThanOrEqual(21);
  });

  it("ne depasse jamais la cible, meme si un tirage rapporte plus que le manque", async () => {
    const { draw } = fakeLibraries({ 1: [100, 0] });
    const current = Array.from({ length: 7 }, (_, i) => row(1, 3000 + i, true));

    const result = await topUpPlayable({ current, target: 10, contributorIds: [1], rejectedKeys: new Set(), draw });

    expect(result.sources).toHaveLength(10);
  });

  it("ne retire jamais un titre deja ecarte ni deja pris", async () => {
    const { draw } = fakeLibraries({ 1: [3, 3] });
    const taken = row(1, 0, true);

    const result = await topUpPlayable({
      current: [taken],
      target: 10,
      contributorIds: [1],
      rejectedKeys: new Set(["1-1"]),
      draw,
    });

    const keys = result.sources.map(s => s.external_id);
    expect(keys.filter(k => k === "1-0")).toHaveLength(1);
    expect(keys).not.toContain("1-1");
    expect(result.rejectedKeys.has("1-1000")).toBe(true);
  });

  it("bibliotheques epuisees : s'arrete sans repasser", async () => {
    const { draw, calls } = fakeLibraries({ 1: [2, 0] });

    const result = await topUpPlayable({ current: [], target: 10, contributorIds: [1], rejectedKeys: new Set(), draw });

    expect(result.sources).toHaveLength(2);
    expect(result.passes).toBe(2);
    expect(calls).toHaveLength(2); // la 2e passe ne trouve rien et s'arrete
  });
});
