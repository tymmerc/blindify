import { Router } from "express";
import { authController } from "../controllers/authController";

const router = Router();

router.get("/login", (req, res) => {
  (req.params as { provider?: string }).provider = "spotify";
  return authController.loginRedirect(req, res);
});

router.get("/callback", (req, res) => {
  (req.params as { provider?: string }).provider = "spotify";
  return authController.callback(req, res);
});

router.get("/:provider/login", authController.loginRedirect);
router.get("/:provider/callback", authController.callback);

router.post("/apple/token", authController.appleMusicToken);
router.post("/guest", authController.guest);

router.get("/me", authController.me);
router.post("/logout", authController.logout);

export default router;
