"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const crypto_1 = require("crypto");
const axios_1 = require("axios");
const db_1 = require("../config/db");
const spotify_1 = require("../config/spotify");
const session_1 = require("../utils/session");
const response_1 = require("../utils/response");
const spotifySync_1 = require("../services/providers/spotifySync");
const SPOTIFY_PLAYBACK_SCOPES = [
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
];
const SPOTIFY_SCOPES = [
    ...SPOTIFY_PLAYBACK_SCOPES,
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-library-modify",
    "user-top-read",
    "playlist-read-private",
    "user-read-recently-played",
];
function frontendBaseUrl() {
    const raw = process.env.FRONTEND_URL || "http://localhost:3000";
    return raw.replace(/\/$/, "");
}
async function upsertUser(provider, providerId, details) {
    const { rows } = await db_1.pool.query(`INSERT INTO users (provider, provider_id, username, email, avatar)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, provider_id)
     DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       email = COALESCE(EXCLUDED.email, users.email),
       avatar = COALESCE(EXCLUDED.avatar, users.avatar)
     RETURNING id, provider, provider_id, username, email, avatar, created_at`, [provider, providerId, details.username ?? null, details.email ?? null, details.avatar ?? null]);
    return rows[0];
}
async function upsertConnection(userId, provider, tokens) {
    await db_1.pool.query(`INSERT INTO user_connections (user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope,
       updated_at = NOW()`, [userId, provider, tokens.access_token ?? null, tokens.refresh_token ?? null, tokens.expires_at ?? null, tokens.scope ?? null]);
}
function storeOAuthState(req, provider, state) {
    if (!req.session) {
        req.session = {};
    }
    req.session.oauth = { provider, state };
}
function readOAuthState(req) {
    const oauth = (req.session && req.session.oauth);
    return oauth ?? {};
}
function clearOAuthState(req) {
    if (req.session) {
        req.session.oauth = undefined;
    }
}
async function performSpotifyCallback(req, res) {
    const code = String(req.query.code || "");
    if (!code) {
        (0, response_1.fail)(res, "missing_code", "Code Spotify absent", 400);
        return;
    }
    const spotify = (0, spotify_1.makeSpotify)();
    let grant;
    try {
        grant = await spotify.authorizationCodeGrant(code);
    }
    catch (err) {
        const status = err?.statusCode ??
            err?.body?.error?.status;
        const message = err?.body?.error?.message ||
            err?.message;
        if (status && [400, 401, 403].includes(status)) {
            (0, response_1.fail)(res, "spotify_auth_forbidden", "Spotify a refusé le code de connexion. Vérifie les autorisations de l'application dans la console Spotify.", status);
            return;
        }
        console.error("spotify_authorization_failed", { status, message, error: err });
        (0, response_1.fail)(res, "spotify_auth_failed", "Impossible de valider le code d'authentification Spotify", 500);
        return;
    }
    const { access_token, refresh_token, expires_in } = grant.body;
    let profile;
    try {
        const { data } = await axios_1.default.get("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        profile = data;
    }
    catch (err) {
        const status = err?.response?.status;
        if (status === 403) {
            (0, response_1.fail)(res, "spotify_profile_forbidden", "Spotify refuse l'accès à ce compte. Assure-toi que l'utilisateur est ajouté comme testeur dans la console Spotify ou que l'app est publiée.");
            return;
        }
        throw err;
    }
    const user = await upsertUser("spotify", profile.id, {
        username: profile.display_name ?? profile.id,
        email: profile.email ?? null,
        avatar: profile.images?.[0]?.url ?? null,
    });
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;
    await upsertConnection(user.id, "spotify", {
        access_token,
        refresh_token: refresh_token ?? null,
        expires_at: expiresAt,
        scope: SPOTIFY_SCOPES,
    });
    const session = await (0, session_1.createSessionToken)(user.id);
    if (!req.session) {
        req.session = {};
    }
    req.session.userId = user.id;
    req.session.sessionToken = session.token;
    const frontend = frontendBaseUrl();
    const redirectUrl = new URL(`${frontend}/auth/callback`);
    redirectUrl.searchParams.set("session_token", session.token);
    redirectUrl.searchParams.set("provider", "spotify");
    res.redirect(302, redirectUrl.toString());
}
async function performDeezerCallback(req, res) {
    const code = String(req.query.code || "");
    if (!code) {
        (0, response_1.fail)(res, "missing_code", "Code Deezer absent", 400);
        return;
    }
    const appId = process.env.DEEZER_APP_ID;
    const secret = process.env.DEEZER_APP_SECRET;
    const redirect = process.env.DEEZER_REDIRECT_URI;
    if (!appId || !secret || !redirect) {
        (0, response_1.fail)(res, "deezer_config_missing", "Configuration Deezer incomplète", 500);
        return;
    }
    const tokenResponse = await axios_1.default.get("https://connect.deezer.com/oauth/access_token.php", {
        params: {
            app_id: appId,
            secret,
            code,
            output: "json",
        },
    });
    const tokenPayload = tokenResponse.data;
    if (!tokenPayload.access_token) {
        (0, response_1.fail)(res, "deezer_token_error", "Impossible d'obtenir le token Deezer", 400, tokenPayload);
        return;
    }
    const profileResponse = await axios_1.default.get("https://api.deezer.com/user/me", {
        params: { access_token: tokenPayload.access_token },
    });
    const profile = profileResponse.data;
    const user = await upsertUser("deezer", String(profile.id), {
        username: profile.name ?? `Deezer ${profile.id}`,
        email: profile.email ?? null,
        avatar: profile.picture_medium ?? null,
    });
    const expiresAt = tokenPayload.expires
        ? new Date(Date.now() + tokenPayload.expires * 1000).toISOString()
        : null;
    await upsertConnection(user.id, "deezer", {
        access_token: tokenPayload.access_token,
        refresh_token: null,
        expires_at: expiresAt,
    });
    const session = await (0, session_1.createSessionToken)(user.id);
    if (!req.session) {
        req.session = {};
    }
    req.session.userId = user.id;
    req.session.sessionToken = session.token;
    const frontend = frontendBaseUrl();
    const redirectUrl = new URL(`${frontend}/auth/callback`);
    redirectUrl.searchParams.set("session_token", session.token);
    redirectUrl.searchParams.set("provider", "deezer");
    res.redirect(302, redirectUrl.toString());
}
function spotifyAuthorizeUrl(req) {
    const spotify = (0, spotify_1.makeSpotify)();
    const state = crypto_1.default.randomUUID();
    storeOAuthState(req, "spotify", state);
    return spotify.createAuthorizeURL(SPOTIFY_SCOPES, state, true);
}
function deezerAuthorizeUrl(req) {
    const appId = process.env.DEEZER_APP_ID;
    const redirect = process.env.DEEZER_REDIRECT_URI;
    const perms = process.env.DEEZER_PERMISSIONS || "basic_access,email,offline_access";
    if (!appId || !redirect) {
        throw new Error("DEEZER_APP_ID and DEEZER_REDIRECT_URI env vars are required");
    }
    const state = crypto_1.default.randomUUID();
    storeOAuthState(req, "deezer", state);
    const url = new URL("https://connect.deezer.com/oauth/auth.php");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("perms", perms);
    url.searchParams.set("state", state);
    return url.toString();
}
function validateState(req, provider, incoming) {
    const { provider: storedProvider, state } = readOAuthState(req);
    return Boolean(state && incoming && storedProvider === provider && state === incoming);
}
exports.authController = {
    loginRedirect(req, res) {
        try {
            const provider = req.params.provider ?? "spotify";
            let redirectUrl;
            if (provider === "spotify") {
                redirectUrl = spotifyAuthorizeUrl(req);
            }
            else if (provider === "deezer") {
                redirectUrl = deezerAuthorizeUrl(req);
            }
            else {
                (0, response_1.fail)(res, "provider_not_supported", "Fournisseur non supporté pour la redirection OAuth", 400);
                return;
            }
            res.redirect(302, redirectUrl);
        }
        catch (error) {
            console.error("auth_redirect_failed", error);
            (0, response_1.fail)(res, "auth_redirect_failed", "Impossible d'initialiser la connexion", 500);
        }
    },
    async callback(req, res) {
        try {
            const providerParam = req.params.provider ?? "spotify";
            const stateParam = typeof req.query.state === "string" ? req.query.state : undefined;
            console.log("oauth_callback_debug", {
                providerParam,
                stateParam,
                session: req.session,
                originalUrl: req.originalUrl,
                query: req.query,
                cookies: req.headers.cookie,
            });
            if (!validateState(req, providerParam, stateParam)) {
                clearOAuthState(req);
                (0, response_1.fail)(res, "state_mismatch", "Vérification d'intégrité échouée", 400);
                return;
            }
            clearOAuthState(req);
            if (providerParam === "spotify") {
                await performSpotifyCallback(req, res);
            }
            else if (providerParam === "deezer") {
                await performDeezerCallback(req, res);
            }
            else {
                (0, response_1.fail)(res, "provider_not_supported", "Callback non implémenté pour ce fournisseur", 400);
            }
        }
        catch (error) {
            console.error("auth_callback_failed", error);
            (0, response_1.fail)(res, "auth_callback_failed", "Impossible de finaliser l'authentification", 500);
        }
    },
    async appleMusicToken(req, res) {
        try {
            const { identityToken, musicUserToken, email, username, appleUserId } = req.body ?? {};
            if (!identityToken || !musicUserToken || !appleUserId) {
                (0, response_1.fail)(res, "payload_invalid", "Les jetons Apple Music sont requis", 400);
                return;
            }
            const user = await upsertUser("apple", appleUserId, {
                username: username ?? `Apple ${appleUserId.slice(0, 6)}`,
                email: email ?? null,
                avatar: null,
            });
            await upsertConnection(user.id, "apple", {
                access_token: musicUserToken,
                refresh_token: identityToken,
                expires_at: null,
            });
            const session = await (0, session_1.createSessionToken)(user.id);
            if (!req.session) {
                req.session = {};
            }
            req.session.userId = user.id;
            req.session.sessionToken = session.token;
            (0, response_1.ok)(res, { sessionToken: session.token, provider: "apple" });
        }
        catch (error) {
            console.error("apple_auth_failed", error);
            (0, response_1.fail)(res, "apple_auth_failed", "Connexion Apple Music impossible", 500);
        }
    },
    async guest(req, res) {
        try {
            const nickname = typeof req.body?.nickname === "string" ? req.body.nickname : null;
            const providerId = crypto_1.default.randomUUID();
            const user = await upsertUser("guest", providerId, {
                username: nickname ?? `Guest-${providerId.slice(0, 6)}`,
                email: null,
                avatar: null,
            });
            const session = await (0, session_1.createSessionToken)(user.id, 1000 * 60 * 60 * 4); // 4h guest session
            if (!req.session) {
                req.session = {};
            }
            req.session.userId = user.id;
            req.session.sessionToken = session.token;
            (0, response_1.ok)(res, { sessionToken: session.token, user });
        }
        catch (error) {
            console.error("guest_auth_failed", error);
            (0, response_1.fail)(res, "guest_auth_failed", "Impossible de créer un invité", 500);
        }
    },
    async me(req, res) {
        const context = await (0, session_1.getSessionContext)(req, res, { autoExtend: true });
        if (!context)
            return;
        (0, response_1.ok)(res, {
            user: context.user,
            providerConnection: context.connection,
        });
    },
    async logout(req, res) {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
                const token = authHeader.slice(7);
                if (token) {
                    await (0, session_1.revokeSessionToken)(token);
                }
            }
            (0, session_1.clearSession)(req);
            (0, response_1.ok)(res, { success: true });
        }
        catch (error) {
            console.error("logout_failed", error);
            (0, response_1.fail)(res, "logout_failed", "Impossible de se déconnecter", 500);
        }
    },
    async spotifyToken(req, res) {
        try {
            const context = await (0, session_1.getSessionContext)(req, res, {
                provider: "spotify",
                requireConnection: true,
                autoExtend: true,
            });
            if (!context || !context.connection)
                return;
            const connection = await (0, spotifySync_1.ensureSpotifyConnection)(context.connection);
            if (!connection.access_token) {
                (0, response_1.fail)(res, "spotify_token_missing", "Token Spotify introuvable", 400);
                return;
            }
            const scopes = new Set((connection.scope ?? []).map(scope => scope.toLowerCase()));
            const missing = SPOTIFY_PLAYBACK_SCOPES.filter(scope => !scopes.has(scope));
            if (missing.length > 0) {
                // We no longer block on playback scopes because preview lookups only need a basic token.
                console.warn("spotify_scope_missing_for_playback", { missing });
            }
            (0, response_1.ok)(res, {
                accessToken: connection.access_token,
                expiresAt: connection.expires_at,
                provider: connection.provider,
                missingScopes: missing,
            });
        }
        catch (error) {
            console.error("spotify_token_failed", error);
            (0, response_1.fail)(res, "spotify_token_failed", "Impossible de récupérer le token Spotify", 500);
        }
    },
};
