"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gamesController_1 = require("../controllers/gamesController");
const router = express_1.default.Router();
router.get("/detailed", gamesController_1.gamesController.detailedStats);
exports.default = router;
