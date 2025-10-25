import express from "express";
import { gamesController } from "../controllers/gamesController";

const router = express.Router();

router.get("/detailed", gamesController.detailedStats);

export default router;