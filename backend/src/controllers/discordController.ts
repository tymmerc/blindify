import type { Request, Response } from "express";
import { readDiscordCredentials } from "../config/discord";
import { DiscordAuthError, exchangeCode, fetchDiscordUser, isValidAuthCode } from "../services/discordAuth";
import { upsertDiscordUser } from "../services/discordAccounts";
import { isValidInstanceId, resolveDiscordRoom } from "../services/discordRooms";
import { roomsController } from "./roomsController";
import { createSessionToken, getSessionContext } from "../utils/session";
import { fail, ok } from "../utils/response";
import { logger } from "../utils/logger";


export const discordController = {
  /** Public : l'identifiant de l'appli, pour que le front initialise le SDK sans rebuild. */
  async config(_req: Request, res: Response): Promise<void> {
    const creds = readDiscordCredentials();
    ok(res, { enabled: creds.ok, clientId: creds.ok ? creds.credentials.clientId : null });
  },

  /**
   * POST /api/auth/discord { code } : le code du SDK devient une session Blindz.
   * Le secret ne quitte pas le serveur ; le jeton d'acces repart au front pour
   * authenticate(). Pas de cookie : a travers le proxy de Discord, la page a
   * une autre origine que l'API, le front envoie le jeton de session en Bearer.
   */
  async auth(req: Request, res: Response): Promise<void> {
    const creds = readDiscordCredentials();
    if (!creds.ok) {
      fail(res, "discord_disabled", "L'Activité Discord n'est pas activée sur ce serveur", 503);
      return;
    }
    const code = req.body?.code;
    if (!isValidAuthCode(code)) {
      fail(res, "invalid_code", "Code de connexion Discord manquant ou invalide", 400);
      return;
    }
    try {
      const { accessToken } = await exchangeCode(code, creds.credentials);
      const discordUser = await fetchDiscordUser(accessToken);
      const user = await upsertDiscordUser(discordUser);
      // Session habituelle (24 h, prolongee a chaque requete) : l'Activite se
      // reconnecte toute seule a chaque lancement (prompt: none), pas besoin
      // d'un an comme pour un invite, dont le cookie est la seule memoire.
      const session = await createSessionToken(user.id);
      logger.info("discord_auth_ok", { userId: user.id });
      // Deux jetons dans la reponse : jamais en cache (RFC 6749, 5.1).
      res.setHeader("Cache-Control", "no-store");
      ok(res, { discordAccessToken: accessToken, sessionToken: session.token, user });
    } catch (error) {
      if (error instanceof DiscordAuthError) {
        // Jamais le code dans le journal : il vaut une connexion pendant quelques minutes.
        // Un secret d'appli faux (invalid_client) est une panne de configuration, pas un refus du joueur.
        if (error.discordError === "invalid_client") {
          logger.error("discord_app_misconfigured", { status: error.status ?? null, discordError: error.discordError });
        } else {
          logger.warn("discord_auth_refused", { kind: error.kind, status: error.status ?? null, discordError: error.discordError ?? null });
        }
        if (error.kind === "code_rejected") {
          fail(res, "discord_code_rejected", "Discord a refusé ce code de connexion. Relance l'Activité.", 401);
          return;
        }
        fail(res, "discord_unavailable", "Discord ne répond pas pour l'instant. Réessaie dans un instant.", 502);
        return;
      }
      logger.error("discord_auth_failed", { error });
      fail(res, "discord_auth_failed", "Connexion Discord impossible pour l'instant", 500);
    }
  },

  /**
   * POST /api/discord/room { instanceId, nickname? } : la salle du salon.
   * Retrouvee ou creee, puis l'entree passe par le join habituel : memes
   * controles (salle pleine, partie en cours, pseudo), meme reponse.
   */
  async room(req: Request, res: Response): Promise<void> {
    const context = await getSessionContext(req, res);
    if (!context) return;
    const instanceId = req.body?.instanceId;
    if (!isValidInstanceId(instanceId)) {
      fail(res, "discord_instance_invalid", "Identifiant de salon Discord invalide", 400);
      return;
    }
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim().slice(0, 30) || null : null;
    let roomCode: string;
    try {
      const { room, created } = await resolveDiscordRoom(instanceId, context.user, nickname);
      roomCode = room.room_code;
      logger.info("discord_room", { roomCode, created, userId: context.user.id });
    } catch (error) {
      logger.error("discord_room_failed", { error, userId: context.user.id });
      fail(res, "discord_room_failed", "Impossible d'ouvrir la salle de ce salon", 500);
      return;
    }
    (req.params as { code?: string }).code = roomCode;
    await roomsController.joinRoom(req, res);
  },
};
