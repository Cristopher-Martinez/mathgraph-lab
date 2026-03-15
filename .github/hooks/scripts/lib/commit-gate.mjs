/**
 * commit-gate.mjs — BLOCKING commit policy enforcement for loop sessions.
 *
 * Tracks file edits since last commit and BLOCKS synthesis (loopAwaitInput)
 * until the agent makes a commit via commitCheckpoint tool.
 *
 * Triggers (any of these -> DENY synthesis):
 *   1. 5+ files edited since last commit
 *   2. 15+ minutes since last commit with pending edits
 *
 * Uses commit-state.json in .project-brain/loops/{sessionId}/.
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { getLoopDir } from "./brain-paths.mjs";

/** Strip UTF-8 BOM — PowerShell writes BOM by default, crashes JSON.parse. */
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// ===============================================================
// Constants
// ===============================================================

/** Minimum edited files before BLOCKING synthesis. */
const FILE_THRESHOLD = 5;

/** Minutes since last commit before BLOCKING (with pending edits). */
const TIME_THRESHOLD_MS = 15 * 60 * 1000;

// ===============================================================
// State I/O
// ===============================================================

/**
 * Get the commit state file path for a session.
 * @param {string} cwd
 * @param {string} sessionId
 * @returns {string}
 */
function getCommitStatePath(cwd, sessionId) {
  const dir = getLoopDir(cwd, sessionId || "_default");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
  return join(dir, "commit-state.json");
}

/**
 * Read the current commit state for a session.
 * @param {string} cwd
 * @param {string} sessionId
 * @returns {{ editedSinceCommit: string[], lastCommitTs: number|null, commitCount: number }}
 */
export function readCommitState(cwd, sessionId) {
  const defaults = {
    editedSinceCommit: [],
    lastCommitTs: null,
    commitCount: 0,
  };

  try {
    const fp = getCommitStatePath(cwd, sessionId);
    if (!existsSync(fp)) return defaults;
    const data = JSON.parse(stripBom(readFileSync(fp, "utf8")));
    return { ...defaults, ...data };
  } catch {
    return defaults;
  }
}

/**
 * Write the commit state for a session.
 * @param {string} cwd
 * @param {string} sessionId
 * @param {object} state
 */
export function writeCommitState(cwd, sessionId, state) {
  try {
    const fp = getCommitStatePath(cwd, sessionId);
    writeFileSync(fp, JSON.stringify(state, null, 2));
  } catch {
    /* ignore */
  }
}

// ===============================================================
// File tracking (called from post-tool-checks)
// ===============================================================

/**
 * Record that a file was edited (for commit tracking).
 * @param {string} cwd
 * @param {string} sessionId
 * @param {string|string[]} filePaths
 */
export function recordCommitEdit(cwd, sessionId, filePaths) {
  if (!sessionId) return;

  const state = readCommitState(cwd, sessionId);
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

  for (const fp of paths) {
    const short = fp ? basename(fp) : "";
    if (short && !state.editedSinceCommit.includes(short)) {
      state.editedSinceCommit.push(short);
    }
  }

  writeCommitState(cwd, sessionId, state);
}

/**
 * Record that a commit was just made (resets tracking).
 * @param {string} cwd
 * @param {string} sessionId
 */
export function recordCommitDone(cwd, sessionId) {
  const state = readCommitState(cwd, sessionId);
  state.editedSinceCommit = [];
  state.lastCommitTs = Date.now();
  state.commitCount += 1;
  writeCommitState(cwd, sessionId, state);
}

/**
 * Set the commit bypass toggle for a session.
 * When true, commit-gate will allow all synthesis without requiring commits.
 * @param {string} cwd
 * @param {string} sessionId
 * @param {boolean} enabled
 */
export function setCommitBypass(cwd, sessionId, enabled) {
  const state = readCommitState(cwd, sessionId);
  state.commitBypass = !!enabled;
  writeCommitState(cwd, sessionId, state);
}

/**
 * Read the commit bypass state for a session.
 * @param {string} cwd
 * @param {string} sessionId
 * @returns {boolean}
 */
export function getCommitBypass(cwd, sessionId) {
  const state = readCommitState(cwd, sessionId);
  return !!state.commitBypass;
}

// ===============================================================
// Git helpers
// ===============================================================

/**
 * @param {string} cwd
 * @returns {string[]}
 */
export function getGitStatus(cwd) {
  try {
    const out = execFileSync("git", ["status", "--short"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} cwd
 * @returns {string}
 */
export function getCurrentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Generate a conventional commit message from git status.
 * @param {string} cwd
 * @returns {string}
 */
export function generateCommitMessage(cwd) {
  const status = getGitStatus(cwd);
  if (status.length === 0) return "";

  const categories = { feat: [], fix: [], refactor: [], docs: [], chore: [] };

  for (const line of status) {
    const file = line.substring(3).trim().split(" -> ").pop() || "";
    const lower = file.toLowerCase();

    if (lower.includes("docs/") || lower.endsWith(".md")) {
      categories.docs.push(file);
    } else if (lower.includes("hooks/") || lower.includes("static/hooks/")) {
      categories.chore.push(file);
    } else if (lower.startsWith("src/")) {
      categories.feat.push(file);
    } else {
      categories.chore.push(file);
    }
  }

  let dominant = "chore";
  let maxCount = 0;
  for (const [cat, files] of Object.entries(categories)) {
    if (files.length > maxCount) {
      maxCount = files.length;
      dominant = cat;
    }
  }

  const allFiles = status.map((l) => basename(l.substring(3).trim()));
  const scope =
    allFiles.length <= 3 ? allFiles.join(", ") : `${allFiles.length} files`;

  return `${dominant}(${scope.substring(0, 40)}): session changes`;
}

// ===============================================================
// Evaluation (BLOCKING — called from PreToolUse at loopAwaitInput)
// ===============================================================

/**
 * Evaluate whether a commit is REQUIRED before synthesis.
 * Returns { decision, context } where decision is "deny" or "allow".
 *
 * BLOCKING: returns "deny" to force the agent to commit first.
 * The agent MUST call commitCheckpoint() before sending synthesis.
 *
 * @param {string} cwd
 * @param {string} sessionId
 * @returns {{ decision: "deny"|"allow", context: string }}
 */
export function evaluateCommitGate(cwd, sessionId) {
  const state = readCommitState(cwd, sessionId);

  // ── Bypass toggle: if user deliberately enabled bypass, allow on any branch ──
  if (state.commitBypass) {
    return { decision: "allow", context: "" };
  }

  // ── Protected branch guard: require bypass OR commit before synthesis ──
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
    const protectedBranches = ["main", "master", "production", "prod"];
    if (
      protectedBranches.some((p) => branch === p || branch.startsWith(`${p}/`))
    ) {
      // On protected branch without bypass — check for uncommitted changes
      const diff = execFileSync("git", ["diff", "--name-only", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).trim();
      const untracked = execFileSync(
        "git",
        ["ls-files", "--others", "--exclude-standard"],
        { cwd, encoding: "utf8" },
      ).trim();
      // Filter auto-generated paths (same as uncommittedCount below)
      const autoGenPaths = ["docs/memory/", ".brain-loops/", ".project-brain/"];
      const isCodeChange = (line) =>
        !autoGenPaths.some((p) => line.includes(p));
      const hasDiffChanges = diff && diff.split("\n").some(isCodeChange);
      const hasUntrackedChanges =
        untracked && untracked.split("\n").some(isCodeChange);
      if (hasDiffChanges || hasUntrackedChanges) {
        return {
          decision: "deny",
          context: `⛔ QUALITY GATE BLOCKED — BRANCH PROTECTION: Rama protegida "${branch}" — hay cambios sin commit.\nACCIÓN REQUERIDA: Haz commit con commitCheckpoint o activa el bypass toggle antes de enviar síntesis.\nRamas protegidas: ${protectedBranches.join(", ")}.`,
        };
      }
    }
  } catch {
    /* git not available — skip branch check */
  }

  const now = Date.now();

  // Check actual git status (more reliable than tracked edits alone)
  const gitStatus = getGitStatus(cwd);
  const uncommittedCount = gitStatus.filter(
    (l) => !l.includes(".brain-loops/") && !l.includes(".project-brain/") && !l.includes("docs/memory/"),
  ).length;

  // No uncommitted code changes -> allow
  if (uncommittedCount === 0) {
    return { decision: "allow", context: "" };
  }

  const editCount = state.editedSinceCommit.length;
  const timeSinceCommit = state.lastCommitTs
    ? now - state.lastCommitTs
    : Infinity;

  // -- Trigger 1: File threshold -> DENY --
  if (editCount >= FILE_THRESHOLD || uncommittedCount >= FILE_THRESHOLD) {
    const fileList = state.editedSinceCommit.slice(0, 8).join(", ");
    return {
      decision: "deny",
      context: buildDenyMessage(
        `${uncommittedCount} archivos sin commit (${editCount} editados esta sesion: ${fileList})`,
        cwd,
      ),
    };
  }

  // -- Trigger 2: Time threshold -> DENY --
  if (editCount > 0 && timeSinceCommit > TIME_THRESHOLD_MS) {
    const mins = Math.round(timeSinceCommit / 60000);
    return {
      decision: "deny",
      context: buildDenyMessage(
        `${mins} min desde el ultimo commit con ${editCount} archivo(s) pendiente(s)`,
        cwd,
      ),
    };
  }

  return { decision: "allow", context: "" };
}

/**
 * Build the blocking deny message for commit gate.
 * @param {string} reason
 * @param {string} cwd
 * @returns {string}
 */
function buildDenyMessage(reason, cwd) {
  const branch = getCurrentBranch(cwd);
  const suggested = generateCommitMessage(cwd);

  return (
    `⛔ QUALITY GATE BLOCKED — COMMIT CHECKPOINT: ${reason}\n` +
    `Branch: ${branch}\n\n` +
    `ACCIÓN REQUERIDA: Haz commit ANTES de enviar síntesis:\n` +
    `1. Llama commitCheckpoint con sessionId y description (OBLIGATORIO)\n` +
    `2. description: explica QUE hiciste, POR QUE, y contexto relevante. Ejemplo:\n` +
    `   "Implementado sistema de commit-gate bloqueante. Se creo commit-gate.mjs con evaluacion de thresholds y lm-tools-commit.ts con generacion de mensajes."\n` +
    `3. Mensaje sugerido para subject line: "${suggested}"\n` +
    `4. El description se convierte en el body del commit — cuanto mas rico, mejor el checkpoint\n\n` +
    `NO puedes continuar sin hacer commit. Esta es una política obligatoria.`
  );
}
