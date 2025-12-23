"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const router = (0, express_1.Router)();
router.get("/login", (req, res) => {
    req.params.provider = "spotify";
    return authController_1.authController.loginRedirect(req, res);
});
router.get("/callback", (req, res) => {
    req.params.provider = "spotify";
    return authController_1.authController.callback(req, res);
});
router.get("/:provider/login", authController_1.authController.loginRedirect);
router.get("/:provider/callback", authController_1.authController.callback);
router.post("/apple/token", authController_1.authController.appleMusicToken);
router.post("/guest", authController_1.authController.guest);
router.get("/me", authController_1.authController.me);
router.post("/logout", authController_1.authController.logout);
router.get("/providers/spotify/token", authController_1.authController.spotifyToken);
exports.default = router;
