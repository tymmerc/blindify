import { Router } from "express";
import { linksController } from "../controllers/linksController";

const router = Router();

router.get("/", (req, res) => linksController.list(req, res));
router.patch("/:id", (req, res) => linksController.toggle(req, res));
router.delete("/:id", (req, res) => linksController.remove(req, res));
router.get("/:id/details", (req, res) => linksController.details(req, res));

export default router;
