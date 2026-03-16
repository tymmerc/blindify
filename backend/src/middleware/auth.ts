import { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  accessToken?: string;
  userId?: number;
}

export const bearerAuth = (req: AuthedRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  req.accessToken = token;
  next();
  return;
};
