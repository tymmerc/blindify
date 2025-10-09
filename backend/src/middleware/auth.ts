import { Request, Response, NextFunction } from "express";
import { makeSpotify } from "../config/spotify";

export interface AuthedRequest extends Request {
  spotify?: ReturnType<typeof makeSpotify>;
  accessToken?: string;
}

export const bearerAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });
  req.accessToken = token;
  req.spotify = makeSpotify(token);
  next();
};
