import { Router } from "express";
import { quickPlayController } from "../controllers/quickPlayController";

const router = Router();

router.post("/", (req, res) => quickPlayController.start(req, res));

export default router;
