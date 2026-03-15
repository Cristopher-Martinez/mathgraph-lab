import { NextFunction, Request, Response } from "express";
import { getRedis } from "../services/redisClient";

export interface AuthRequest extends Request {
  username?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const token = authHeader.slice(7);
    const redis = getRedis();
    const raw = await redis.get(`session:${token}`);

    if (!raw) {
      return res.status(401).json({ error: "Sesión expirada" });
    }

    const session = JSON.parse(raw);
    req.username = session.username;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido" });
  }
}
