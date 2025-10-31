import express from "express";
import { roomsController } from "../controllers/roomsController";

const router = express.Router();

router.post("/create", roomsController.createRoom);
router.post("/:code/join", roomsController.joinRoom);

export default router;
