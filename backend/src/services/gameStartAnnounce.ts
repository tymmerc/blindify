/**
 * Branchement du mail de debut de partie (T18) sur le vrai backend : le
 * notificateur unique, construit depuis l'environnement, et l'appel fait par
 * le lancement de partie (roomsController.startGameLocked).
 *
 * Config absente (cas du dev, de la pile sans faux Resend, des tests) : le
 * backend demarre quand meme, journalise `notif_partie_desactivee` une fois,
 * et aucun lancement ne fait la moindre requete en plus.
 */
import { pool } from "../config/db";
import { logger } from "../utils/logger";
import { loadNotifConfig, resendTestBase, sendNotifMail, type NotifConfig } from "./gameStartMail";
import { createGameStartNotifier, type GameStartNotifier } from "./gameStartNotifier";
import { readSpectatorSecret } from "./spectatorToken";

let notifier: GameStartNotifier | null = null;
let config: NotifConfig | null = null;

function linkBase(): string {
  const raw = process.env.SPECTATEUR_BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || "https://blindz.app";
  return raw.replace(/\/+$/, "");
}

function getConfig(): NotifConfig {
  if (!config) config = loadNotifConfig();
  return config;
}

function getNotifier(): GameStartNotifier {
  if (!notifier) {
    notifier = createGameStartNotifier({
      config: getConfig(),
      secret: readSpectatorSecret(),
      linkBase: linkBase(),
      send: mail => sendNotifMail({ config: getConfig(), mail }),
    });
  }
  return notifier;
}

/** Au demarrage : dit ce qui est actif, sans jamais une valeur. */
export function reportGameStartNotifStatus(): void {
  const c = getConfig();
  if (c.missing.length) logger.info("notif_partie_desactivee", { manque: c.missing });
  else logger.info("notif_partie_active", { faux_resend: resendTestBase() !== null });
  if (!readSpectatorSecret()) logger.info("spectateur_desactive", { manque: "SPECTATEUR_SECRET (32 caracteres au moins)" });
}

export type AnnounceInput = {
  roomId: number;
  roomCode: string;
  mode: string;
  players: Array<{ id: number; username: string | null }>;
  providers: Array<string | null | undefined>;
  /** Requete de lancement portant une cle E2E valide. */
  e2e: boolean;
};

/**
 * Appele juste apres le demarrage de la manche 1. Rend la main tout de suite :
 * la seule lecture en base (la salle est-elle un salon Discord ?) et l'envoi
 * partent apres, et rien ne remonte jamais vers le lancement.
 */
export function announceGameStart(input: AnnounceInput): void {
  if (getConfig().missing.length) return;
  // Sur la pile, toutes les requetes portent la cle E2E : sous son faux
  // Resend, le filtre E2E est leve pour tester le vrai chemin.
  const e2e = input.e2e && resendTestBase() === null;
  void (async () => {
    let discord = false;
    try {
      const { rows } = await pool.query<{ discord: boolean }>(
        `SELECT discord_instance_id IS NOT NULL AS discord FROM multiplayer_rooms WHERE id=$1`,
        [input.roomId],
      );
      discord = rows[0]?.discord === true;
    } catch {
      // Colonne absente (base sans la migration 006) : salle du site.
    }
    getNotifier().onGameStarted({ ...input, e2e, discord });
  })().catch(err => logger.warn("notif_partie_echec", { detail: err instanceof Error ? err.name : "erreur" }));
}

/** Tests seulement : repart de l'environnement courant. */
export function resetGameStartAnnounceForTests(): void {
  notifier = null;
  config = null;
}
