import { Router } from "express";
import { authController } from "../controllers/authController";
export const authRouter = Router();
authRouter.get("/login", authController.login);
authRouter.get("/callback", authController.callback);
authRouter.get("/refresh_token", authController.refreshToken);
