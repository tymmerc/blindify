import { Router } from "express";
import { importController } from "../controllers/importController";

const router = Router();

router.post("/playlists", (req, res) => importController.playlists(req, res));
router.post("/sync", (req, res) => importController.sync(req, res));
router.post("/sync-all", (req, res) => importController.syncAll(req, res));

export default router;
