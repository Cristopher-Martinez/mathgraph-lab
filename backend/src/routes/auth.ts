import { randomUUID } from "crypto";
import { Router } from "express";
import { getRedis } from "../services/redisClient";

const router = Router();
const SESSION_TTL = 24 * 3600; // 24 hours

// Credenciales desde variable de entorno (formato: user1:pass1,user2:pass2)
function getUsers() {
  const raw = process.env.AUTH_USERS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => {
      const [username, password] = entry.split(":");
      return { username: username.trim(), password: password.trim() };
    })
    .filter((u) => u.username && u.password);
}

/**
 * POST /auth/login
 * Login con sesión persistida en Redis
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username y password requeridos" });
    }

    const user = getUsers().find(
      (u) => u.username === username && u.password === password,
    );

    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Generar token seguro y guardar en Redis
    const token = randomUUID();
    const redis = getRedis();
    await redis.setex(
      `session:${token}`,
      SESSION_TTL,
      JSON.stringify({ username, createdAt: Date.now() }),
    );

    res.json({
      token,
      user: { username },
    });
  } catch (error: any) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error en autenticación" });
  }
});

/**
 * POST /auth/verify
 * Verificar token contra Redis
 */
router.post("/verify", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const redis = getRedis();
    const raw = await redis.get(`session:${token}`);

    if (raw) {
      const session = JSON.parse(raw);
      res.json({ valid: true, user: { username: session.username } });
    } else {
      res.status(401).json({ valid: false });
    }
  } catch (error: any) {
    res.status(401).json({ valid: false });
  }
});

/**
 * POST /auth/logout
 * Invalidar sesión en Redis
 */
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const redis = getRedis();
      await redis.del(`session:${token}`);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

export default router;
