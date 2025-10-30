/**
 * Authentication Middleware for Blindify Backend
 * Handles Spotify OAuth2 Bearer token authentication
 */

import { Request, Response, NextFunction } from "express";
import { makeSpotify } from "../config/spotify";

/**
 * Extended Express Request interface with Spotify authentication
 */
export interface AuthedRequest extends Request {
  spotify?: ReturnType<typeof makeSpotify>;
  accessToken?: string;
  userId?: number;
  spotifyId?: string;
}

/**
 * Bearer token authentication middleware
 * Validates and extracts Spotify access token from Authorization header
 * 
 * @param req - Express request with potential auth headers
 * @param res - Express response
 * @param next - Express next function
 */
export const bearerAuth = (req: AuthedRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  
  req.accessToken = token;
  req.spotify = makeSpotify(token);
  next();
  return;
};