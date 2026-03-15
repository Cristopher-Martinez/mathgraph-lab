#!/usr/bin/env node

/**
 * Validates required environment variables before starting dev server.
 * Called automatically via npm predev hook.
 */

const dotenv = require("dotenv");
const path = require("path");

// Load .env from backend (where dotenv/config is used)
dotenv.config({ path: path.join(__dirname, "..", "backend", ".env") });
// Also try root .env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const REQUIRED = [
  { key: "DATABASE_URL", label: "PostgreSQL connection string" },
  { key: "GEMINI_API_KEY", label: "Google Gemini API key" },
  { key: "AUTH_USERS", label: "Auth credentials (user:pass format)" },
];

const missing = REQUIRED.filter((v) => !process.env[v.key]);

if (missing.length > 0) {
  console.error("\n\x1b[31m╔══════════════════════════════════════╗");
  console.error("║   ⚠  VARIABLES DE ENTORNO FALTANTES  ║");
  console.error("╚══════════════════════════════════════╝\x1b[0m\n");
  missing.forEach((v) => {
    console.error(`  \x1b[33m✗ ${v.key}\x1b[0m — ${v.label}`);
  });
  console.error(
    "\n  Agrega estas variables a \x1b[36mbackend/.env\x1b[0m y vuelve a intentar.\n"
  );
  process.exit(1);
}

console.log("\x1b[32m✓ Variables de entorno verificadas\x1b[0m");
