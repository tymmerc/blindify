import SpotifyWebApi from "spotify-web-api-node";
import dotenv from "dotenv";
dotenv.config();

export const makeSpotify = (access_token?: string, refresh_token?: string) => {
  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });

  if (access_token) api.setAccessToken(access_token);
  if (refresh_token) api.setRefreshToken(refresh_token);

  return api;
};
