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
    // Algunos clientes no pueden enviar headers (ej. <img src="..."> del navegador).
    // Para esos casos aceptamos el token vía query string (?token=...).
    let token: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (typeof req.query.token === "string" && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: "No autorizado" });
    }

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
