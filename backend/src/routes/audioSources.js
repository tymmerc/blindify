"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const audioSourcesController_1 = require("../controllers/audioSourcesController");
const router = (0, express_1.Router)();
router.get("/", audioSourcesController_1.audioSourcesController.index);
router.post("/sync", audioSourcesController_1.audioSourcesController.sync);
router.post("/local", audioSourcesController_1.audioSourcesController.createLocal);
exports.default = router;
