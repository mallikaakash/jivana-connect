#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import {
  buildClaudeCodePrompt,
  buildImplementationPrompt,
  loadSpec,
} from "./lib/prompt.mjs";
import {
  isCursorStartupError,
  runCursorEngine,
} from "./lib/cursor-engine.mjs";
import { runClaudeEngine } from "./lib/claude-engine.mjs";
import {
  authHelpMessage,
  resolveCursorApiKey,
} from "./lib/cursor-auth.mjs";
import { resolveGitCloudTarget } from "./lib/git-remote.mjs";

const { values, positionals } = parseArgs({
  options: {
    engine: { type: "string", short: "e", default: "cursor" },
    spec: { type: "string", short: "s", default: "docs/SPEC.md" },
    cwd: { type: "string", default: process.cwd() },
    model: { type: "string", default: "composer-2.5" },
    cloud: { type: "boolean", default: false },
    "cloud-repo": { type: "string" },
    "cloud-ref": { type: "string" },
    detach: { type: "boolean", default: false },
    "auto-pr": { type: "boolean", default: false },
    "no-stream": { type: "boolean", default: false },
    "cursor-settings": {
      type: "string",
      default: "",
    },
    "claude-bin": { type: "string", default: "claude" },
    "claude-permission-mode": {
      type: "string",
      default: "acceptEdits",
    },
    instructions: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: npm run implement -- [options]

Launch spec implementation with Cursor Cloud (recommended) or Claude Code.

Options:
  -e, --engine <cursor|claude>   Runtime (default: cursor)
  -s, --spec <path>                Spec markdown (default: docs/SPEC.md)
      --cwd <path>                   Working directory
      --model <id>                   Cursor model (default: composer-2.5)

  Cursor cloud (monitor in browser + npm run monitor):
      --cloud                        Use git origin + current branch on Cursor Cloud
      --cloud-repo <git-url>         Override repo URL
      --cloud-ref <branch>           Override git ref (default: current branch or main)
      --detach                       Start cloud run and exit (monitor separately)
      --auto-pr                      Open a PR when the cloud agent finishes
      --no-stream                    Do not stream logs locally (still waits unless --detach)

  Local Cursor:
      --cursor-settings <list>       e.g. "all" to load project MCP/rules

  Claude Code:
      --claude-bin, --claude-permission-mode

  -h, --help

Environment:
  CURSOR_API_KEY   Optional if you ran npm run cursor:login (same Cursor account)

Auth (once):
  npm run cursor:login

Examples:
  npm run implement -- --cloud --detach
  npm run monitor -- --follow
  npm run implement -- --cloud --auto-pr --spec docs/SPEC.md
`);
  process.exit(0);
}

const engine = String(values.engine).toLowerCase();
if (engine !== "cursor" && engine !== "claude") {
  console.error(`Unknown engine "${values.engine}". Use cursor or claude.`);
  process.exit(1);
}

const cwd = path.resolve(values.cwd);
const specPath = values.spec;
const extraInstructions =
  values.instructions ??
  (positionals.length > 0 ? positionals.join(" ") : undefined);

async function resolveCloudRepo() {
  if (!values.cloud && !values["cloud-repo"]) {
    return null;
  }

  if (values["cloud-repo"]) {
    return {
      url: values["cloud-repo"],
      ref: values["cloud-ref"] ?? "main",
    };
  }

  const detected = await resolveGitCloudTarget(cwd);
  return {
    url: detected.url,
    ref: values["cloud-ref"] ?? detected.ref,
  };
}

async function main() {
  const { path: resolvedSpecPath, text: specText } = await loadSpec(specPath, cwd);

  if (engine === "cursor") {
    const apiKey = await resolveCursorApiKey();
    if (!apiKey) {
      console.error(authHelpMessage());
      process.exit(1);
    }

    const prompt = buildImplementationPrompt({
      specPath: resolvedSpecPath,
      specText,
      extraInstructions,
    });

    const settingSources = values["cursor-settings"]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const cloudRepo = await resolveCloudRepo();

    if (values.detach && !cloudRepo) {
      console.error("--detach only applies to Cursor Cloud. Add --cloud or --cloud-repo.");
      process.exit(1);
    }

    try {
      const outcome = await runCursorEngine({
        apiKey,
        cwd,
        prompt,
        modelId: values.model,
        cloudRepo,
        stream: !values["no-stream"],
        settingSources,
        detach: values.detach,
        cloudOptions: {
          autoCreatePR: values["auto-pr"],
          skipReviewerRequest: true,
          metadata: {
            project: "clini-ai",
            spec_path: specPath,
          },
        },
        sessionMeta: { specPath: resolvedSpecPath },
      });
      if (outcome.status !== "detached") {
        process.stderr.write(
          `\n[cursor] finished status=${outcome.status} agent=${outcome.agentId} run=${outcome.runId}\n`,
        );
      }
    } catch (err) {
      if (isCursorStartupError(err)) {
        console.error(
          `Cursor startup failed: ${err.message} (retryable=${err.isRetryable})`,
        );
        process.exit(1);
      }
      if (err.code === "RUN_FAILED") {
        console.error(err.message);
        process.exit(2);
      }
      throw err;
    }
    return;
  }

  if (values.cloud || values.detach) {
    console.error("Cloud/detach flags apply only to --engine cursor.");
    process.exit(1);
  }

  const prompt = buildClaudeCodePrompt({
    specPath: resolvedSpecPath,
    extraInstructions,
  });

  try {
    const outcome = await runClaudeEngine({
      cwd,
      prompt,
      claudeBin: values["claude-bin"],
      permissionMode: values["claude-permission-mode"],
    });
    process.stderr.write(
      `\n[claude] finished session=${outcome.sessionId ?? "n/a"}\n`,
    );
  } catch (err) {
    if (err.code === "CLAUDE_EXIT" || err.code === "CLAUDE_RUN_FAILED") {
      console.error(err.message);
      process.exit(err.code === "CLAUDE_RUN_FAILED" ? 2 : 1);
    }
    if (err.code === "ENOENT") {
      console.error(
        `Claude Code not found (${values["claude-bin"]}). Install from https://docs.anthropic.com/en/docs/claude-code`,
      );
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  if (err.code === "ENOENT") {
    console.error(err.message);
    console.error(
      `Copy docs/SPEC.template.md to ${specPath} and fill in your spec first.`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
