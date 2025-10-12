import express from "express";
import { gamesController } from "../controllers/gamesController";

const router = express.Router();

router.post("/games/solo/start", gamesController.startSoloGame);
router.get("/games/history", gamesController.history);
router.get("/stats/detailed", gamesController.detailedStats);

export default router;
