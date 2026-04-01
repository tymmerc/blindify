import { Router } from "express";
import { challengeController } from "../controllers/challengeController";

const router = Router();

router.post("/", challengeController.create);
router.get("/:code", challengeController.get);
router.post("/:code/complete", challengeController.complete);

export default router;
