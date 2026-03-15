import { Router } from "express";

const router = Router();

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
 * Login simple con usuario y contraseña
 */
router.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username y password requeridos" });
    }

    // Verificar credenciales
    const user = getUsers().find(
      (u) => u.username === username && u.password === password,
    );

    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Generar token simple (base64)
    const token = Buffer.from(`${username}:${Date.now()}`).toString("base64");

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
 * Verificar si el token es válido
 */
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ valid: false });
    }

    // Decodificar token
    const decoded = Buffer.from(token, "base64").toString();
    const [username] = decoded.split(":");

    // Verificar que el usuario existe
    const user = getUsers().find((u) => u.username === username);

    if (user) {
      res.json({ valid: true, user: { username } });
    } else {
      res.status(401).json({ valid: false });
    }
  } catch (error: any) {
    res.status(401).json({ valid: false });
  }
});

export default router;
