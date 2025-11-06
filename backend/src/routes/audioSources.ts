import { Router } from "express";
import { audioSourcesController } from "../controllers/audioSourcesController";

const router = Router();

router.get("/", audioSourcesController.index);
router.post("/sync", audioSourcesController.sync);
router.post("/local", audioSourcesController.createLocal);

export default router;
