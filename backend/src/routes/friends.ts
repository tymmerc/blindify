import express from "express";
import { friendsController } from "../controllers/friendsController";

const router = express.Router();

router.get("/", friendsController.list);
router.get("/list", friendsController.list);
router.post("/request", friendsController.request);
router.post("/:userId/accept", friendsController.accept);
router.post("/accept", friendsController.accept);
router.post("/decline", friendsController.decline);
router.delete("/:userId", friendsController.remove);

export default router;
