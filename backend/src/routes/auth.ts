import { Router } from "express";
import { authController } from "../controllers/authController";
import { discordController } from "../controllers/discordController";

const router = Router();

router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.post("/guest", (req, res) => authController.guest(req, res));
// Activite Discord : le code OAuth2 du SDK devient une session Blindz (meme limiteur que les autres connexions).
router.post("/discord", (req, res) => discordController.auth(req, res));
router.get("/me", (req, res) => authController.me(req, res));
router.post("/logout", (req, res) => authController.logout(req, res));
router.delete("/account", (req, res) => authController.deleteAccount(req, res));

export default router;
