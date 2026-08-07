import { Router } from "express";
import { authController } from "../controllers/authController";

const router = Router();

router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.post("/guest", (req, res) => authController.guest(req, res));
router.get("/me", (req, res) => authController.me(req, res));
router.post("/logout", (req, res) => authController.logout(req, res));
router.delete("/account", (req, res) => authController.deleteAccount(req, res));

export default router;
