import express from "express";
import { streamerController } from "../controllers/streamerController";

const router = express.Router();

// Mode streamer (T5) : interrupteur STREAMER_MODE, lu par la carte des modes.
router.get("/status", streamerController.status);

export default router;
