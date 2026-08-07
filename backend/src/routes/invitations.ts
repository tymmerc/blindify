import express from "express";
import { invitationsController } from "../controllers/invitationsController";

const router = express.Router();

router.get("/recent-players", invitationsController.recentPlayers);
router.post("/send", invitationsController.send);
router.post("/accept", invitationsController.accept);
router.post("/decline", invitationsController.decline);
router.get("/pending", invitationsController.pending);

export default router;
