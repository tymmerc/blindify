import { Router } from "express";
import { gamesController } from "../controllers/gamesController";

const router = Router();

router.post("/solo", gamesController.startSoloGame);
router.post("/solo/start", gamesController.startSoloGame); // legacy alias
router.get("/history", gamesController.history);

export default router;
