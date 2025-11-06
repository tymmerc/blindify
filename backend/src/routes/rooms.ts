import express from "express";
import { roomsController } from "../controllers/roomsController";

const router = express.Router();

router.post("/create", roomsController.createRoom);
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
