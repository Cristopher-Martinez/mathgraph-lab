#!/usr/bin/env node
/**
 * PreToolUse hook — Security gate + loop context injection.
 * Responsibilities:
 *   1. Block destructive commands (rm -rf, del /s /q, DROP TABLE, etc.)
 *   2. Protect sensitive files (.github/hooks/**, .env, identity, soul)
 *   3. Guard against commits to master/main (ask confirmation)
 *   4. Auto-approve safe read-only operations
 *   5. Inject loop protocol + mailbox messages when active loop detected
 * I/O Contract:
 *   stdin  → { tool_name, tool_input, tool_use_id, cwd, sessionId }
 *   stdout → { continue, hookSpecificOutput: { permissionDecision, permissionDecisionReason, additionalContext } }
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getLoopsDir, getMemoryDirWithFallback } from "./lib/brain-paths.mjs";
import { guardedHook } from "./lib/hook-guard.mjs";

/**
 * Known message pipelines. When editing a file in a pipeline, remind the agent
 * about sibling files that likely need coordinated changes.
 * Key: basename (lowercase). Value: { pipeline, siblings, role }.
 */
const PIPELINE_MAP = {
  "messages.ts": {
    pipeline: "webview ↔ extension",
    siblings: [
      "reducer.ts (action + case + initial state)",
      "messageHandler.ts (dispatch case)",
      "brain-hq-message-handler.ts (routing switch)",
    ],
    role: "types",
    hint: "Adding a message type? Ensure it's in the correct union (ExtensionToWebview OR WebviewToExtension) AND all siblings are updated.",
  },
  "reducer.ts": {
    pipeline: "webview ↔ extension",
    siblings: ["messages.ts (type definition)", "messageHandler.ts (dispatch)"],
    role: "state",
    hint: "Adding state? Define initial value, ALL transitions (add/update/remove), and check if state entities can move between arrays.",
  },
  "messagehandler.ts": {
    pipeline: "webview ↔ extension",
    siblings: ["messages.ts (type)", "reducer.ts (action + case)"],
    role: "dispatch",
    hint: "Every incoming message type needs a dispatch case here. Miss one = silently dropped.",
  },
  "brain-hq-message-handler.ts": {
    pipeline: "webview ↔ extension",
    siblings: [
      "brain-hq-*-handler.ts (handler function)",
      "messages.ts (WebviewToExtensionMessage type)",
    ],
    role: "routing",
    hint: "CRITICAL: The routing switch MUST list every webview→extension message type. Unlisted = silently ignored.",
  },
};

guardedHook("pre-tool-security", async (input) => {
  const { evaluateAuditGate, isUrgentMessage, recordUrgentMessage } =
    await import("./lib/audit-gate.mjs");
  const { evaluateAutohydrateGate } = await import(
    "./lib/autohydrate-gate.mjs"
  );
  const { evaluateCommitGate } = await import("./lib/commit-gate.mjs");
  const { evaluateImmunityGate } = await import("./lib/immunity-gate.mjs");
  const { saveToolCheckpoint, summarizeToolInput } =
    await import("./lib/execution-checkpoint.mjs");
  const { detectPipelineGaps, readPipelineEdits } =
    await import("./lib/fs-utils.mjs");
  const { readAllActiveLoops } = await import("./lib/loop-utils.mjs");
  const {
    detectPipelineGapsFromConfig,
    getPipelineInfoFromConfig,
    loadPipelineConfig,
    matchConfigCommand,
  } = await import("./lib/pipeline-config.mjs");
  const { consumePostCompactPayload } =
    await import("./lib/post-compact-utils.mjs");
  const { getTopNotesForInjection } =
    await import("./lib/temporal-mailbox.mjs");

  // ——— Mailbox context builder (runs before security checks) ———

  function buildMailboxContext(cwd) {
    const loops = readAllActiveLoops(cwd);

    if (!loops || loops.length === 0) return "";

    try {
      const activeIds = new Set(loops.map((l) => l.sessionId).filter(Boolean));

      // Read mailbox for unread messages targeting any active session
      const mailboxFile = join(getLoopsDir(cwd), "mailbox.json");
      if (!existsSync(mailboxFile)) return "";

      const mailbox = JSON.parse(readFileSync(mailboxFile, "utf8"));
      // —— Determine current session for scoped filtering ——
      let currentSessionId = null;
      try {
        const trackFile = join(getLoopsDir(cwd), "hook-last-session.json");
        if (existsSync(trackFile)) {
          const track = JSON.parse(readFileSync(trackFile, "utf8"));
          // Only use if fresh (< 30 minutes) and matches an active loop
          if (
            track.loopSessionId &&
            activeIds.has(track.loopSessionId) &&
            Date.now() - (track.timestamp || 0) < 30 * 60 * 1000
          ) {
            currentSessionId = track.loopSessionId;
          }
        }
      } catch {
        /* tracking best-effort */
      }

      const unread = (mailbox.messages || []).filter(
        (m) =>
          !m.read &&
          (!m.status || m.status === "active") &&
          !activeIds.has(m.from) &&
          (currentSessionId
            ? m.to === currentSessionId || m.to === null
            : m.to === null || activeIds.has(m.to)) &&
          (!m.channel || m.channel === "loop"),
      );

      if (unread.length === 0) return "";

      // —— Mark as read IMMEDIATELY (atomic write-back) ——
      for (const m of unread) {
        const orig = mailbox.messages.find((o) => o.id === m.id);
        if (orig) orig.read = true;
      }
      try {
        const tmp = mailboxFile + ".tmp." + process.pid;
        writeFileSync(tmp, JSON.stringify(mailbox, null, 2), "utf8");
        renameSync(tmp, mailboxFile);
      } catch {
        /* write-back best-effort */
      }

      const msgLines = unread.map(
        (m) =>
          `- [${m.type}] from ${m.from.substring(0, 8)}: ${m.content.substring(0, 200)}`,
      );
      const context = `📬 MAILBOX (${unread.length} unread across ${activeIds.size} active loops): ${msgLines.join("; ")}`;
      return context;
    } catch {
      return "";
    }
  }

  // ——— Pipeline definitions for integration audit ———

  // Match handler files (brain-hq-*-handler.ts) generically
  function getPipelineInfo(basename, cwd) {
    // Try config-driven first
    const config = loadPipelineConfig(cwd);
    if (config) {
      const fromConfig = getPipelineInfoFromConfig(basename, config);
      if (fromConfig) return fromConfig;
    }
    // Fallback to hardcoded map (for projects without pipeline-config.json)
    const key = basename.toLowerCase();
    if (PIPELINE_MAP[key]) return PIPELINE_MAP[key];
    if (/^brain-hq-\w+-handler\.ts$/.test(key)) {
      return {
        pipeline: "webview ↔ extension",
        siblings: [
          "brain-hq-message-handler.ts (routing switch must include your new message types)",
          "messages.ts (type definitions)",
        ],
        role: "handler",
        hint: "Check: Are ALL new message types added to the routing switch in brain-hq-message-handler.ts?",
      };
    }
    return null;
  }

  // ——— Context routing: tool-specific reminders ———

  function buildToolContext(toolName, toolInput, cwd) {
    const hints = [];

    // File editing tools → remind file size limits + patterns
    if (
      toolName === "replace_string_in_file" ||
      toolName === "multi_replace_string_in_file" ||
      toolName === "create_file"
    ) {
      const filePath = toolInput.filePath || "";
      const isSrc = /[/\\]src[/\\]/.test(filePath);
      if (isSrc) {
        hints.push(
          "⚠️ FILE RULES: Max 400 lines per file in src/. If approaching 350, plan a split. Named exports only (no export default).",
        );
      }

      // Pipeline-aware integration reminder
      const allPaths =
        toolName === "multi_replace_string_in_file"
          ? (toolInput.replacements || [])
              .map((r) => r.filePath)
              .filter(Boolean)
          : [filePath].filter(Boolean);
      for (const fp of allPaths) {
        const basename = (fp || "").split(/[/\\]/).pop() || "";
        const info = getPipelineInfo(basename, cwd);
        if (info) {
          hints.push(
            `🔗 PIPELINE [${info.pipeline}] — editing ${info.role} file. Siblings: ${info.siblings.join(", ")}. ${info.hint}`,
          );
          break; // One reminder per tool call is enough
        }
      }
    }

    // Terminal commands → remind deploy rules
    if (toolName === "run_in_terminal") {
      const cmd = toolInput.command || "";
      if (/copy-item.*dist[/\\]|xcopy.*dist[/\\]|cp\s.*dist\//i.test(cmd)) {
        hints.push(
          "⚠️ DEPLOY: Always use `npm run deploy`. NEVER use Copy-Item for dist/.",
        );
      }
      if (/npm\s+install|npm\s+i\b/i.test(cmd)) {
        hints.push(
          "⚠️ DEPS: Check if the dependency already exists before installing. No unnecessary deps.",
        );
      }
    }

    // Tesseract: inject top temporal notes BEFORE search/read tools (pre-action context)
    const searchReadTools = [
      "grep_search",
      "semantic_search",
      "read_file",
      "file_search",
    ];
    if (searchReadTools.includes(toolName)) {
      try {
        const memDir = getMemoryDirWithFallback(cwd);
        const sessDir = join(memDir, "sessions");
        const { formatted } = getTopNotesForInjection(sessDir, 3);
        if (formatted) {
          hints.push(formatted.trim());
        }
      } catch {}
    }

    return hints.join(" ");
  }

  // ——— Gate block signaling (allow tool but signal handler) ———

  function persistGateBlock(baseCwd, sessionId, reason) {
    try {
      const dir = getLoopsDir(baseCwd || process.cwd());
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pending-gate.json"),
        JSON.stringify({ sessionId, reason, timestamp: Date.now() }),
        "utf8",
      );
    } catch {
      /* best-effort */
    }
  }

  // ——— Block reason persistence ———

  function getBlockReasonPath(baseCwd) {
    return join(getLoopsDir(baseCwd || process.cwd()), "last-tool-block.json");
  }

  function persistBlockReason(baseCwd, toolName, reason) {
    try {
      const dir = getLoopsDir(baseCwd || process.cwd());
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(
        getBlockReasonPath(baseCwd),
        JSON.stringify({
          tool: toolName,
          reason: reason,
          timestamp: Date.now(),
          remainingReads: 5,
        }),
        "utf8",
      );
    } catch {
      /* best-effort */
    }
  }

  function consumeBlockReason(baseCwd) {
    try {
      const fp = getBlockReasonPath(baseCwd);
      if (!existsSync(fp)) return null;
      const data = JSON.parse(readFileSync(fp, "utf8"));
      // Only consume if recent (< 5 minutes)
      if (Date.now() - (data.timestamp || 0) > 5 * 60 * 1000) {
        try {
          unlinkSync(fp);
        } catch {
          /* stale */
        }
        return null;
      }
      // Decrement counter — persist across multiple reads so agent sees it
      const remaining = (data.remainingReads ?? 1) - 1;
      if (remaining <= 0) {
        try {
          unlinkSync(fp);
        } catch {
          /* cleanup */
        }
      } else {
        try {
          writeFileSync(
            fp,
            JSON.stringify({ ...data, remainingReads: remaining }),
            "utf8",
          );
        } catch {
          /* best-effort */
        }
      }
      return data;
    } catch {
      return null;
    }
  }

  // ——— Emit helper ———

  function emit(decision, reason, additionalContext) {
    // Persist deny reasons so the agent can see them on the next tool call
    if (decision === "deny") {
      persistBlockReason(
        input.cwd || process.cwd(),
        input.tool_name || "unknown",
        reason,
      );
    }
    return {
      continue: decision !== "deny",
      hookSpecificOutput: {
        permissionDecision: decision,
        permissionDecisionReason: reason,
        additionalContext: additionalContext || undefined,
      },
    };
  }

  // ——— Main hook logic ———

  const toolName = input.tool_name || "";
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  // Skip injections for our own tools (prevent feedback loops)
  const customPrefixes = ["projectBrain", "projectbrain", "crismart"];
  const isOwnTool = customPrefixes.some((p) =>
    toolName.toLowerCase().startsWith(p.toLowerCase()),
  );

  // —— Session tracking: remember which loop this conversation is running ——
  if (isOwnTool && toolInput.sessionId) {
    try {
      const trackFile = join(getLoopsDir(cwd), "hook-last-session.json");
      writeFileSync(
        trackFile,
        JSON.stringify({
          loopSessionId: toolInput.sessionId,
          timestamp: Date.now(),
        }),
        "utf8",
      );
    } catch {
      /* non-fatal */
    }
  }

  // ═══ AUDIT GATE: Intercept loopAwaitInput before synthesis ═══
  // Strategy: NEVER deny loopAwaitInput (agent can't see deny reasons).
  // Instead: allow + write pending-gate.json → tool handler returns gate msg.
  if (isOwnTool && toolInput.tool === "loopAwaitInput") {
    const sessionId = toolInput.sessionId || "";
    const synthesis = toolInput.synthesis || "";
    if (sessionId) {
      // ── Step 1: AUDIT GATE (code discipline) ──
      const { decision, context: auditCtx } = evaluateAuditGate(
        cwd,
        sessionId,
        synthesis,
      );
      if (decision === "deny") {
        persistGateBlock(cwd, sessionId, auditCtx);
        return emit(
          "allow",
          "Gate intercepted — tool handler will return reason.",
          auditCtx,
        );
      }

      // ── Step 2: AUTOHYDRATE GATE (knowledge capture) ──
      const autohydrateResult = evaluateAutohydrateGate(
        cwd,
        sessionId,
        synthesis,
      );
      if (autohydrateResult.decision === "deny") {
        const combined = auditCtx
          ? `${auditCtx}\n\n${autohydrateResult.context}`
          : autohydrateResult.context;
        persistGateBlock(cwd, sessionId, combined);
        return emit(
          "allow",
          "Gate intercepted — tool handler will return reason.",
          combined,
        );
      }

      // ── Step 3: COMMIT GATE (code checkpoint) ──
      const commitResult = evaluateCommitGate(cwd, sessionId);
      if (commitResult.decision === "deny") {
        const combined = auditCtx
          ? `${auditCtx}\n\n${commitResult.context}`
          : commitResult.context;
        persistGateBlock(cwd, sessionId, combined);
        return emit(
          "allow",
          "Gate intercepted — tool handler will return reason.",
          combined,
        );
      }

      // All gates passed — return audit context if exists
      if (auditCtx) {
        return emit("allow", "All gates passed.", auditCtx);
      }
    }
  }

  // ═══ URGENT MESSAGE CHECK: Detect urgent user feedback ═══
  // When loopSendFeedback gives feedback text, check for urgency markers
  if (isOwnTool && toolInput.tool === "loopSendFeedback") {
    const feedback = toolInput.feedback || "";
    if (isUrgentMessage(feedback)) {
      const loops = readAllActiveLoops(cwd);
      const sessionId = loops.length === 1 ? loops[0].sessionId : "";
      if (sessionId) {
        recordUrgentMessage(cwd, sessionId, feedback.substring(0, 500));
      }
    }
  }

  // ═══ Tool-level checkpoint (crash recovery breadcrumb) ═══
  // Write BEFORE tool executes — post-tool clears it.
  // If session dies mid-tool, next session knows what was happening.
  if (!isOwnTool) {
    try {
      const memDir = getMemoryDirWithFallback(cwd);
      if (existsSync(memDir)) {
        saveToolCheckpoint(memDir, {
          tool: toolName,
          inputSummary: summarizeToolInput(toolName, toolInput),
        });
      }
    } catch {}
  }

  // Build contextual hints BEFORE security gate
  const mailboxContext = isOwnTool ? "" : buildMailboxContext(cwd);
  const toolContext = isOwnTool
    ? ""
    : buildToolContext(toolName, toolInput, cwd);
  const postCompactContext = consumePostCompactPayload(cwd);
  // ——— Inject previous block reason (if any) ———
  const previousBlock = consumeBlockReason(cwd);
  const blockRecoveryContext = previousBlock
    ? `⛔⛔⛔ CRITICAL: YOUR PREVIOUS TOOL CALL WAS BLOCKED ⛔⛔⛔\n` +
      `Tool "${previousBlock.tool}" was DENIED by a security/quality gate.\n` +
      `REASON: ${previousBlock.reason}\n` +
      `ACTION REQUIRED: Read the reason above and resolve it BEFORE continuing your task. ` +
      `If you are in a loop, do NOT write to the user. Fix the issue first, then call loopAwaitInput. ` +
      `If you need user input, use ask_questions (QuickPick). NEVER break the loop because of a block.`
    : "";

  let combinedContext =
    [blockRecoveryContext, postCompactContext, mailboxContext, toolContext]
      .filter(Boolean)
      .join("\n") || "";

  // ═══════════════════════════════════════════════════════
  // 1. AUTO-APPROVE safe read-only tools
  // ═══════════════════════════════════════════════════════
  const safeTools = [
    "read_file",
    "grep_search",
    "file_search",
    "semantic_search",
    "list_dir",
    "get_errors",
    "ask_questions",
    "manage_todo_list",
    "switch_agent",
    "get_terminal_output",
    "tool_search_tool_regex",
  ];

  if (safeTools.includes(toolName)) {
    return emit(
      "allow",
      "Read-only or safe tool — auto-approved.",
      combinedContext,
    );
  }

  // ═══════════════════════════════════════════════════════
  // 2. BLOCK destructive commands in terminal
  // ═══════════════════════════════════════════════════════
  if (toolName === "run_in_terminal" || toolName === "runSubagent") {
    const cmd = toolInput.command || toolInput.prompt || "";
    const destructive = [
      /rm\s+(-rf|--recursive|--force)/i,
      /del\s+\/[sq]/i,
      /Remove-Item\s+.*-Recurse\s+-Force/i,
      /git\s+push\s+.*--force/i,
      /DROP\s+(TABLE|DATABASE)/i,
      /FORMAT\s+[A-Z]:/i,
      /mkfs\./i,
    ];

    for (const pattern of destructive) {
      if (pattern.test(cmd)) {
        return emit(
          "deny",
          `Blocked destructive command: ${pattern.source}`,
          combinedContext,
        );
      }
    }

    // ═══════════════════════════════════════════════
    // 2b. PIPELINE GAP GATES (compile warning + deploy block)
    //     Config-driven: reads commands + gapAction from pipeline-config.json
    //     Fallback: hardcoded patterns if no config
    // ═══════════════════════════════════════════════
    const config = loadPipelineConfig(cwd);
    const memDir = getMemoryDirWithFallback(cwd);
    const sessionsDir = join(memDir, "sessions");
    const pipelineEdits = readPipelineEdits(sessionsDir);
    const configGaps =
      pipelineEdits.length >= 2
        ? detectPipelineGapsFromConfig(cwd, pipelineEdits)
        : [];
    const gaps = configGaps.length > 0 ? configGaps : detectPipelineGaps(cwd);

    if (gaps.length > 0) {
      const gapList = gaps.map((g) => `  ⛔ ${g}`).join("\n");
      const cmdMatch = matchConfigCommand(cmd, config);
      const gapAction = config?.gapAction || {};

      // Level 4: DENY deploy when pipeline gaps exist
      const isDeploy = cmdMatch === "deploy" || /npm\s+run\s+deploy/i.test(cmd);
      if (isDeploy && (gapAction.onDeploy || "deny") === "deny") {
        return emit(
          "deny",
          `PIPELINE GAPS — deploy blocked until resolved:\n${gapList}\nFix all pipeline siblings BEFORE deploying.`,
          combinedContext,
        );
      }

      // Level 3: Strong warning on compile (advisory, not blocking)
      const isBuild =
        cmdMatch === "build" || /npm\s+run\s+compile|npx\s+tsc/i.test(cmd);
      if (isBuild && (gapAction.onBuild || "warn") !== "off") {
        const warning = `⛔ PIPELINE GAPS DETECTED — ${gaps.length} integration risk(s):\n${gapList}\nRESOLVE THESE before shipping. Missing sibling = silent bug at runtime.`;
        combinedContext = combinedContext
          ? `${combinedContext}\n${warning}`
          : warning;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // 3. PROTECT sensitive files from editing
  // ═══════════════════════════════════════════════════════
  const protectedPatterns = [
    /\.github\/hooks\//,
    /\.env$/,
    /08_AGENT_IDENTITY\.md$/,
    /09_AGENT_SOUL\.md$/,
    /10_USER_PROFILE\.md$/,
  ];

  const checkProtected = (path) => {
    const normalized = (path || "").replace(/\\/g, "/");
    for (const pattern of protectedPatterns) {
      if (pattern.test(normalized)) return normalized;
    }
    return null;
  };

  if (toolName === "replace_string_in_file" || toolName === "create_file") {
    const hit = checkProtected(toolInput.filePath);
    if (hit)
      return emit("ask", `Editing protected file: ${hit}`, combinedContext);
  }

  if (toolName === "multi_replace_string_in_file") {
    const replacements = toolInput.replacements || [];
    for (const r of replacements) {
      const hit = checkProtected(r.filePath);
      if (hit)
        return emit("ask", `Editing protected file: ${hit}`, combinedContext);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 4. GUARD commits to master/main
  // ═══════════════════════════════════════════════════════
  if (toolName === "run_in_terminal") {
    const cmd = toolInput.command || "";
    if (/git\s+(commit|merge|push)/i.test(cmd)) {
      try {
        const branch = execFileSync("git", ["branch", "--show-current"], {
          cwd,
          encoding: "utf8",
          timeout: 3000,
        }).trim();
        if (branch === "master" || branch === "main") {
          return emit(
            "ask",
            `You are on branch '${branch}'. Proceed with git operation?`,
            combinedContext,
          );
        }
      } catch {
        /* can't detect branch, allow */
      }
    }
  }

  // ═══════════════════════════════════════════════════════  // 5. 🧬 IMMUNITY GATE: Detect known error patterns before repetition
  // ═══════════════════════════════════════════════════════════════════
  {
    const immunity = evaluateImmunityGate({ toolName, toolInput, cwd });
    if (immunity.decision === "deny") {
      return emit("deny", immunity.message, combinedContext);
    }
    if (immunity.decision === "ask") {
      return emit("ask", immunity.message, combinedContext);
    }
  }

  // ═══════════════════════════════════════════════════════════════════  // DEFAULT: Allow everything else
  // ═══════════════════════════════════════════════════════
  return emit("allow", "No security concerns.", combinedContext);
});
