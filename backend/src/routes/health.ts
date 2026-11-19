import type { Request, Response } from "express";
import { getRedisHealth } from "../config/redis";
import { ok } from "../utils/response";

// Toujours 200 et status "ok" : la sonde de prod et la pile de test de nuit
// attendent ce 200. Redis absent ne casse pas le jeu, seulement la reprise.
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  ok(res, { status: "ok", redis: await getRedisHealth() });
}
