"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSpotify = void 0;
const spotify_web_api_node_1 = require("spotify-web-api-node");
const dotenv_1 = require("dotenv");
dotenv_1.default.config();
const makeSpotify = (access_token, refresh_token) => {
    const backendBase = process.env.PUBLIC_BACKEND_URL ||
        process.env.BACKEND_URL ||
        "http://localhost:3000";
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${backendBase.replace(/\/$/, "")}/api/auth/callback`;
    const api = new spotify_web_api_node_1.default({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri,
    });
    if (access_token)
        api.setAccessToken(access_token);
    if (refresh_token)
        api.setRefreshToken(refresh_token);
    return api;
};
exports.makeSpotify = makeSpotify;
