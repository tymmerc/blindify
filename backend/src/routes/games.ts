import express from "express";
import { gamesController } from "../controllers/gamesController";

const router = express.Router();

router.post("/solo/start", gamesController.startSoloGame);
router.get("/history", gamesController.history);

export default router;