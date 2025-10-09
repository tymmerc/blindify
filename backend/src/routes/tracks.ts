import express from "express";
import { getRandomLikedTracks } from "../controllers/tracksController";

const router = express.Router();

router.get("/liked20", getRandomLikedTracks);

export default router;
