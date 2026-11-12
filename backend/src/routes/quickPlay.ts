import { Router } from "express";
import { quickPlayController } from "../controllers/quickPlayController";
import { shortLinkLimiter } from "../middleware/shortLinkLimiter";
import { youtubeLimiter, youtubeOneAtATime } from "../middleware/youtubeLimiter";

const router = Router();

router.post("/", shortLinkLimiter, youtubeLimiter, youtubeOneAtATime, (req, res) => quickPlayController.start(req, res));

export default router;
