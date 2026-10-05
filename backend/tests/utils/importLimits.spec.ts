import { describe, it, expect } from "@jest/globals";
import {
  normalizeSyncAllRequest,
  MAX_PLAYLISTS_PER_SYNC,
  MAX_TRACKS_PER_PLAYLIST,
  DEFAULT_TRACKS_PER_PLAYLIST,
} from "../../src/utils/importLimits";

// Fonction pure : aucun mock, aucune base, aucun reseau.

const SPOTIFY_A = "37i9dQZF1DXcBWIGoYBM5M";
const SPOTIFY_B = "37i9dQZF1DX0XUsuxWHRQd";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(1000 + i));
}

describe("normalizeSyncAllRequest : parametres obligatoires", () => {
  it("refuse un corps vide ou sans liste", () => {
    for (const body of [undefined, null, {}, { provider: "deezer" }, { provider: "deezer", playlistIds: [] }, { provider: "deezer", playlistIds: "123" }]) {
      const r = normalizeSyncAllRequest(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("missing_params");
    }
  });

  it("refuse un fournisseur inconnu", () => {
    const r = normalizeSyncAllRequest({ provider: "youtube", playlistIds: ["123"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_provider");
  });
});

describe("normalizeSyncAllRequest : identifiants de playlist", () => {
  it("garde les ids Deezer numeriques, ecarte le reste", () => {
    const r = normalizeSyncAllRequest({
      provider: "deezer",
      playlistIds: ["111", "../user/5", 42, "abc", "", null, { id: "222" }, "222"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.playlistIds).toEqual(["111", "222"]);
      expect(r.ignored).toBe(6);
    }
  });

  it("garde les ids Spotify (22 caracteres base62), ecarte un id Deezer envoye pour Spotify", () => {
    const r = normalizeSyncAllRequest({ provider: "spotify", playlistIds: [SPOTIFY_A, "908622995", SPOTIFY_B] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.playlistIds).toEqual([SPOTIFY_A, SPOTIFY_B]);
      expect(r.ignored).toBe(1);
    }
  });

  it("supprime les doublons sans les compter comme ignores", () => {
    const r = normalizeSyncAllRequest({ provider: "deezer", playlistIds: ["111", "111", "222", "111"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.playlistIds).toEqual(["111", "222"]);
      expect(r.ignored).toBe(0);
    }
  });

  it("refuse la requete si aucun id n'est valide", () => {
    const r = normalizeSyncAllRequest({ provider: "deezer", playlistIds: ["../../me", "abc"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_playlist_ids");
  });

  it(`coupe a ${MAX_PLAYLISTS_PER_SYNC} playlists (le plafond d'un profil a l'import)`, () => {
    const r = normalizeSyncAllRequest({ provider: "deezer", playlistIds: ids(MAX_PLAYLISTS_PER_SYNC + 50) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.playlistIds).toHaveLength(MAX_PLAYLISTS_PER_SYNC);
      expect(r.playlistIds[0]).toBe("1000");
      expect(r.truncated).toBe(50);
    }
  });

  it("ne coupe rien sous le plafond", () => {
    const r = normalizeSyncAllRequest({ provider: "deezer", playlistIds: ids(MAX_PLAYLISTS_PER_SYNC) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.truncated).toBe(0);
  });
});

describe("normalizeSyncAllRequest : titres par playlist", () => {
  const base = { provider: "deezer", playlistIds: ["111"] };

  it(`vaut ${DEFAULT_TRACKS_PER_PLAYLIST} par defaut`, () => {
    for (const maxTracksPerPlaylist of [undefined, 0, -3, "50", Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = normalizeSyncAllRequest({ ...base, maxTracksPerPlaylist });
      expect(r.ok && r.perPlaylistLimit).toBe(DEFAULT_TRACKS_PER_PLAYLIST);
    }
  });

  it("respecte une valeur sous le plafond, arrondie a l'entier", () => {
    expect(normalizeSyncAllRequest({ ...base, maxTracksPerPlaylist: 50 })).toMatchObject({ ok: true, perPlaylistLimit: 50 });
    expect(normalizeSyncAllRequest({ ...base, maxTracksPerPlaylist: 12.7 })).toMatchObject({ ok: true, perPlaylistLimit: 12 });
  });

  it(`plafonne a ${MAX_TRACKS_PER_PLAYLIST} meme si le client en demande 500`, () => {
    expect(normalizeSyncAllRequest({ ...base, maxTracksPerPlaylist: 500 })).toMatchObject({
      ok: true,
      perPlaylistLimit: MAX_TRACKS_PER_PLAYLIST,
    });
  });
});

describe("normalizeSyncAllRequest : carte de bibliotheque", () => {
  const base = { provider: "deezer", playlistIds: ["111"] };

  it("garde un linkId entier positif", () => {
    expect(normalizeSyncAllRequest({ ...base, linkId: 42 })).toMatchObject({ ok: true, linkId: 42 });
  });

  it("remplace par null tout linkId qui n'est pas un entier positif", () => {
    for (const linkId of [undefined, null, 0, -1, 1.5, "42", "5; DROP TABLE x", {}, Number.MAX_SAFE_INTEGER + 1]) {
      expect(normalizeSyncAllRequest({ ...base, linkId })).toMatchObject({ ok: true, linkId: null });
    }
  });
});
