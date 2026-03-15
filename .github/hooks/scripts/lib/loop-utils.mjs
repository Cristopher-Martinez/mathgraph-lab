/**
 * Shared loop utilities for hooks.
 * Cross-platform, no external deps.
 * MULTI-LOOP: Supports per-session signal files (active-loop-{sessionId}.json)
 * with backward compat for legacy single file (active-loop.json).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";

/** Strip UTF-8 BOM — PowerShell writes BOM by default, crashes JSON.parse. */
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** Max age for signal files before considered stale (4 hours) */
const LOOP_SIGNAL_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Validate and read a single loop signal file with TTL check.
 * Auto-cleans stale files (>24h).
 * @param {string} filePath
 * @returns {{ sessionId: string, goal: string, startedAt: string } | null}
 */
function readAndValidateLoop(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const stat = statSync(filePath);
    if (Date.now() - stat.mtimeMs > LOOP_SIGNAL_TTL_MS) {
      try {
        unlinkSync(filePath);
      } catch {}
      return null;
    }
    const data = JSON.parse(stripBom(readFileSync(filePath, "utf8")));
    return data.sessionId ? data : null;
  } catch {
    return null;
  }
}

/**
 * Read ALL active loop signals (multi-loop safe).
 * Scans per-session files first, falls back to legacy single file.
 * @param {string} cwd - Workspace root
 * @returns {Array<{ sessionId: string, goal: string, startedAt: string }>}
 */
export function readAllActiveLoops(cwd) {
  const sessionsDir = join(cwd, "docs", "memory", "sessions");
  const results = [];
  const seenIds = new Set();

  // 1. Per-session signal files: active-loop-{sessionId}.json
  try {
    const files = readdirSync(sessionsDir).filter(
      (f) => f.startsWith("active-loop-") && f.endsWith(".json"),
    );
    for (const f of files) {
      const data = readAndValidateLoop(join(sessionsDir, f));
      if (data && !seenIds.has(data.sessionId)) {
        results.push(data);
        seenIds.add(data.sessionId);
      }
    }
  } catch {
    /* dir might not exist */
  }

  // 2. Legacy fallback: active-loop.json (no session suffix)
  if (results.length === 0) {
    const legacy = readAndValidateLoop(join(sessionsDir, "active-loop.json"));
    if (legacy && !seenIds.has(legacy.sessionId)) {
      results.push(legacy);
    }
  }

  return results;
}

/**
 * Read a single active loop signal (backward-compat wrapper).
 * When multiple loops exist, returns the most recent one.
 * @param {string} cwd - Workspace root
 * @returns {{ sessionId: string, goal: string, startedAt: string } | null}
 */
export function readActiveLoop(cwd) {
  const all = readAllActiveLoops(cwd);
  return all.length > 0 ? all[all.length - 1] : null;
}
