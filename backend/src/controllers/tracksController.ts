import { Request, Response } from "express";
import SpotifyWebApi from "spotify-web-api-node";
import dotenv from "dotenv";

dotenv.config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

export const getRandomLikedTracks = async (req: Request, res: Response) => {
  try {
    const access_token = req.headers.authorization?.split(" ")[1];
    if (!access_token) {
      return res.status(401).json({ error: "Token Spotify manquant" });
    }

    spotifyApi.setAccessToken(access_token);

    const limit = 50;
    let allTracks: any[] = [];
    let offset = 0;
    let done = false;

    while (!done) {
      const result = await spotifyApi.getMySavedTracks({ limit, offset });
      const items = result.body.items;
      if (items.length === 0) done = true;
      else {
        allTracks.push(...items);
        offset += limit;
      }
      if (allTracks.length >= 200) break; // on limite pour la démo
    }

    if (allTracks.length === 0)
      return res.status(404).json({ error: "Aucun titre liké trouvé" });

    const selected = allTracks
      .sort(() => 0.5 - Math.random())
      .slice(0, 20)
      .map((t) => ({
        id: t.track.id,
        name: t.track.name,
        artist: t.track.artists.map((a: any) => a.name).join(", "),
        preview_url: t.track.preview_url,
        album_cover: t.track.album.images[0]?.url,
      }));

    res.json(selected);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors du tirage des titres." });
  }
};
