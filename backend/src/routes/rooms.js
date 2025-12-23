"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const roomsController_1 = require("../controllers/roomsController");
const router = express_1.default.Router();
router.post("/create", roomsController_1.roomsController.createRoom);
// Place the state endpoint before the generic :code route to ensure it matches
router.get("/:code/state", roomsController_1.roomsController.state);
router.post("/:code/preferences", roomsController_1.roomsController.preferences);
router.get("/:code", roomsController_1.roomsController.details);
router.post("/:code/start", roomsController_1.roomsController.startGame);
router.post("/join", (req, res) => {
    if (typeof req.body?.code === "string") {
        req.params.code = req.body.code;
    }
    return roomsController_1.roomsController.joinRoom(req, res);
});
router.post("/:code/join", roomsController_1.roomsController.joinRoom);
exports.default = router;
