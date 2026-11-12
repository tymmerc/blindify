import { Router } from "express";
import { importController } from "../controllers/importController";
import { shortLinkLimiter } from "../middleware/shortLinkLimiter";
import { youtubeLimiter, youtubeOneAtATime } from "../middleware/youtubeLimiter";

const router = Router();

router.post("/playlists", shortLinkLimiter, youtubeLimiter, youtubeOneAtATime, (req, res) => importController.playlists(req, res));
router.post("/sync", youtubeLimiter, youtubeOneAtATime, (req, res) => importController.sync(req, res));
router.post("/sync-all", youtubeLimiter, youtubeOneAtATime, (req, res) => importController.syncAll(req, res));

export default router;
