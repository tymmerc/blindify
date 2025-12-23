"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gamesController_1 = require("../controllers/gamesController");
const router = (0, express_1.Router)();
router.post("/solo", gamesController_1.gamesController.startSoloGame);
router.post("/solo/start", gamesController_1.gamesController.startSoloGame); // legacy alias
router.post("/solo/complete", gamesController_1.gamesController.recordSoloResult);
router.get("/history", gamesController_1.gamesController.history);
exports.default = router;
