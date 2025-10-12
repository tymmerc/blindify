import { Request, Response } from "express";
import axios from "axios";
import { makeSpotify } from "../config/spotify";
import { pool } from "../config/db";

export const authController = {
  /**
   * 🎵 Étape 1 : Redirection vers Spotify pour autorisation
   */
  login: (_req: Request, res: Response) => {
    try {
      const api = makeSpotify();
      const scopes = [
        "user-read-private",
        "user-read-email",
        "user-library-read",
        "user-top-read",
      ];

      const authorizeUrl = api.createAuthorizeURL(scopes, "state123");
      console.log("🔗 Redirecting user to Spotify:", authorizeUrl);

      res.redirect(authorizeUrl);
    } catch (err) {
      console.error("❌ Error during Spotify login redirect:", err);
      res.status(500).send("Erreur interne lors de la redirection Spotify.");
    }
  },

  /**
   * 🎧 Étape 2 : Callback Spotify → échange du code contre les tokens
   */
  callback: async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code || "");
      if (!code) {
        console.error("❌ No authorization code received from Spotify.");
        return res.status(400).send("Code d'autorisation manquant.");
      }

      const api = makeSpotify();
      const grant = await api.authorizationCodeGrant(code);
      const { access_token, refresh_token } = grant.body;

      // 🔍 Récupération du profil utilisateur
      const { data: me } = await axios.get("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const spotify_id = me.id;
      const username = me.display_name || "Unknown";

      console.log(`🎶 Utilisateur connecté : ${username} (${spotify_id})`);

      // 💾 Enregistrement / mise à jour en base
      await pool.query(
        `
        INSERT INTO users (spotify_id, username, access_token, refresh_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (spotify_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token
      `,
        [spotify_id, username, access_token, refresh_token]
      );

      console.log("✅ Utilisateur enregistré / mis à jour dans la base.");

      // ✅ Redirection vers le frontend (menu)
      const redirectUrl = `${process.env.FRONTEND_URL}/menu`;
      console.log("➡️ Redirecting user to:", redirectUrl);

      res.redirect(redirectUrl);
    } catch (err: any) {
      console.error("❌ Spotify callback error:", err.response?.data || err);
      res
        .status(500)
        .send("Erreur lors de l'authentification avec Spotify. Réessaie plus tard.");
    }
  },

  /**
   * ♻️ Étape 3 : Rafraîchir le token d’accès
   */
  refreshToken: async (req: Request, res: Response) => {
    try {
      const refresh = String(req.query.refresh_token || "");
      if (!refresh) {
        return res.status(400).json({ error: "Missing refresh_token" });
      }

      const api = makeSpotify(undefined, refresh);
      const refreshed = await api.refreshAccessToken();

      console.log("🔄 Token Spotify rafraîchi avec succès.");

      res.json({ access_token: refreshed.body.access_token });
    } catch (err) {
      console.error("❌ Token refresh failed:", err);
      res.status(500).json({ error: "Cannot refresh token" });
    }
  },

  /**
   * ✅ Vérifie l’authentification utilisateur (token actuel)
   */
  me: async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ authenticated: false });
      return;
    }

    const result = await pool.query(`SELECT * FROM users WHERE access_token=$1`, [token]);
    if (!result.rows.length) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, user: result.rows[0] });
  },
};
