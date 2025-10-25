import express from "express";
import { gamesController } from "../controllers/gamesController";

const router = express.Router();

// Enlevez le préfixe /games et /stats, ils seront ajoutés dans index.ts
router.post("/solo/start", gamesController.startSoloGame);
router.get("/history", gamesController.history);

export default router;