import SpotifyWebApi from "spotify-web-api-node";
import dotenv from "dotenv";
dotenv.config();

export const makeSpotify = (access_token?: string, refresh_token?: string) => {
  const backendBase =
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3000";
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI || `${backendBase.replace(/\/$/, "")}/api/auth/callback`;

  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID!,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
    redirectUri,
  });

  if (access_token) api.setAccessToken(access_token);
  if (refresh_token) api.setRefreshToken(refresh_token);

  return api;
};
