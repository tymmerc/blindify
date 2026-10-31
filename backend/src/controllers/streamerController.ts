/**
 * Routes du mode streamer (T5) : etat de l'interrupteur, lien d'overlay OBS,
 * et garde-fous du lancement appeles par roomsController.
 */
import type { Request, Response } from "express";
import { pool } from "../config/db";
import { getSessionContext } from "../utils/session";
import { ok, fail } from "../utils/response";
import { logger } from "../utils/logger";
import { validRoomCode } from "../utils/socketValidation";
import { maxStreamerGames, maxStreamerViewers, streamerModeEnabled } from "../services/streamerConfig";
import { activeStreamerGames, getStreamerState } from "../services/streamerGame";
import { OVERLAY_TTL_MS, overlayLink, readOverlaySecret, signOverlayToken } from "../services/overlayToken";

/** Base du front, comme le lien spectateur de T18 (gameStartAnnounce.ts). */
function frontBase(): string {
  const raw = process.env.SPECTATEUR_BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || "https://blindz.app";
  return raw.replace(/\/+$/, "");
}

export type StreamerStartRefusal = { status: number; code: string; message: string };

/**
 * Le lancement d'une partie streamer est-il permis ? Null si oui. Interrupteur
 * STREAMER_MODE, puis plafond de parties en meme temps sur le serveur.
 */
export function streamerStartRefusal(roomCode: string): StreamerStartRefusal | null {
  if (!streamerModeEnabled()) {
    return { status: 403, code: "streamer_off", message: "Le mode streamer est fermé pour le moment." };
  }
  const live = getStreamerState(roomCode);
  if (live && live.phase !== "GAME_OVER") {
    return { status: 409, code: "room_locked", message: "La partie a déjà démarré" };
  }
  const others = activeStreamerGames().filter(code => code !== roomCode);
  if (others.length >= maxStreamerGames()) {
    return {
      status: 503,
      code: "streamer_full",
      message: "Trop de lives en même temps sur Blindz. Réessaie dans quelques minutes.",
    };
  }
  return null;
}

export const streamerController = {
  /** Lu par le front (carte « Avec ta communauté », lobby) : mode ouvert ou non. */
  status(_req: Request, res: Response): void {
    ok(res, {
      enabled: streamerModeEnabled(),
      overlay: Boolean(readOverlaySecret()),
      maxViewers: maxStreamerViewers(),
    });
  },

  /** Lien d'overlay signe, pour l'hote de la salle seulement. */
  async overlay(req: Request, res: Response): Promise<void> {
    const code = validRoomCode(req.params?.code)?.toUpperCase();
    if (!code) {
      fail(res, "room_code_missing", "Code de salle requis", 400);
      return;
    }
    const context = await getSessionContext(req, res);
    if (!context) return;
    if (!streamerModeEnabled()) {
      fail(res, "streamer_off", "Le mode streamer est fermé pour le moment.", 403);
      return;
    }
    const secret = readOverlaySecret();
    if (!secret) {
      fail(res, "overlay_desactive", "Le lien d'overlay n'est pas configuré sur le serveur.", 503);
      return;
    }
    try {
      const { rows } = await pool.query<{ id: number; host_user_id: number; mode: string }>(
        `SELECT id, host_user_id, mode FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
        [code],
      );
      const room = rows[0];
      if (!room || room.mode !== "streamer") {
        fail(res, "room_not_found", "Salle introuvable", 404);
        return;
      }
      if (room.host_user_id !== context.user.id) {
        fail(res, "room_forbidden", "Seul le streamer peut récupérer ce lien.", 403);
        return;
      }
      const expiresAt = Date.now() + OVERLAY_TTL_MS;
      const token = signOverlayToken({ roomCode: code, roomId: room.id, expiresAt }, secret);
      ok(res, { url: overlayLink(frontBase(), code, token), expiresAt });
    } catch (err) {
      logger.error("overlay_link_failed", { roomCode: code, error: err });
      fail(res, "overlay_failed", "Impossible de créer le lien d'overlay. Réessaie.", 500);
    }
  },
};
