import express from "express";
import { roomsController } from "../controllers/roomsController";

const router = express.Router();

router.post("/create", roomsController.createRoom);
// Place the state endpoint before the generic :code route to ensure it matches
router.get("/:code/state", roomsController.state);
router.post("/:code/preferences", roomsController.preferences);
router.get("/:code", roomsController.details);
router.post("/:code/start", roomsController.startGame);
router.post("/join", (req, res) => {
  if (typeof req.body?.code === "string") {
    (req.params as { code?: string }).code = req.body.code;
  }
  return roomsController.joinRoom(req, res);
});
router.post("/:code/join", roomsController.joinRoom);

export default router;
