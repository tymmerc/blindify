import { Router } from "express";
import { quickPlayController } from "../controllers/quickPlayController";
import { shortLinkLimiter } from "../middleware/shortLinkLimiter";

const router = Router();

router.post("/", shortLinkLimiter, (req, res) => quickPlayController.start(req, res));

export default router;
