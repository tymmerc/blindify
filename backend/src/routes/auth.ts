import { Router } from "express";
import { authController } from "../controllers/authController";

const router = Router();

router.get("/login", authController.login);
router.get("/callback", authController.callback);
router.get("/refresh_token", authController.refreshToken);
router.get("/me", authController.me); // maintenant existe bien

export default router;
