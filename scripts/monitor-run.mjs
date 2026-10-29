#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { Agent, CursorAgentError } from "@cursor/sdk";
import {
  cloudAgentWebUrl,
  printMonitorLinks,
} from "./lib/cloud-links.mjs";
import { fetchCloudAgent, fetchCloudRun } from "./lib/cursor-api.mjs";
import { streamRun } from "./lib/monitor-stream.mjs";
import {
  authHelpMessage,
  resolveCursorApiKey,
} from "./lib/cursor-auth.mjs";
import {
  listRunSessions,
  loadRunSession,
} from "./lib/run-session.mjs";

const { values } = parseArgs({
  options: {
    follow: { type: "boolean", short: "f", default: false },
    status: { type: "boolean", short: "s", default: false },
    list: { type: "boolean", short: "l", default: false },
    watch: { type: "boolean", default: false },
    interval: { type: "string", default: "15" },
    session: { type: "string" },
    agent: { type: "string" },
    run: { type: "string" },
    cwd: { type: "string", default: process.cwd() },
    cancel: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run monitor -- [options]

Monitor a Cursor Cloud agent run (saved by npm run implement).

Options:
  -f, --follow          Stream live logs until the run finishes
  -s, --status          Print current agent + run status once (REST API)
      --watch           Poll --status every --interval seconds until terminal
      --interval <sec>  Poll interval for --watch (default: 15)
  -l, --list            List recent saved sessions in .cursor/runs/
      --session <path>    Session JSON (default: .cursor/runs/latest.json)
      --agent <bc-...>    Override agent id
      --run <run-...>     Override run id
      --cancel            Cancel the run (requires live SDK attach)
  -h, --help

Environment:
  CURSOR_API_KEY   Optional if you ran npm run cursor:login

Examples:
  npm run monitor -- --status
  npm run monitor -- --follow
  npm run monitor -- --watch --interval 10
  npm run monitor -- --list
`);
  process.exit(0);
}

const cwd = path.resolve(values.cwd);

async function requireApiKey() {
  const apiKey = await resolveCursorApiKey();
  if (!apiKey) {
    console.error(authHelpMessage());
    process.exit(1);
  }
  return apiKey;
}

async function resolveTarget() {
  let agentId = values.agent;
  let runId = values.run;
  let sessionPath;

  if (!agentId || !runId) {
    const session = await loadRunSession(cwd, values.session);
    agentId = agentId ?? session.agentId;
    runId = runId ?? session.runId;
    sessionPath = session._path;
  }

  if (!agentId || !runId) {
    console.error("Missing agent/run. Run npm run implement -- --cloud first, or pass --agent and --run.");
    process.exit(1);
  }

  return { agentId, runId, sessionPath };
}

const TERMINAL_RUN_STATUSES = new Set([
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
]);

async function printStatus(apiKey, agentId, runId) {
  const [agent, run] = await Promise.all([
    fetchCloudAgent(apiKey, agentId),
    fetchCloudRun(apiKey, agentId, runId),
  ]);

  console.log(JSON.stringify({
    agentId: agent.id ?? agentId,
    agentStatus: agent.status,
    agentUrl: agent.url ?? cloudAgentWebUrl(agentId),
    runId: run.id ?? runId,
    runStatus: run.status,
    updatedAt: run.updatedAt ?? agent.updatedAt,
    prUrl: run.target?.prUrl ?? run.prUrl,
    summary: run.summary ?? agent.summary,
  }, null, 2));
}

async function followRun(apiKey, agentId, runId) {
  printMonitorLinks({ agentId, runId });

  await using agent = await Agent.resume(agentId, { apiKey });
  const run = await Agent.getRun(runId, {
    runtime: "cloud",
    agentId,
    apiKey,
  });

  if (run.supports("stream")) {
    await streamRun(run);
  } else {
    process.stderr.write("[monitor] stream unavailable; polling status instead\n");
    await printStatus(apiKey, agentId, runId);
  }

  if (run.supports("wait")) {
    const result = await run.wait();
    process.stderr.write(`\n[monitor] finished status=${result.status}\n`);
    if (result.git?.branches?.length) {
      for (const b of result.git.branches) {
        if (b.prUrl) process.stderr.write(`[git] pr=${b.prUrl}\n`);
      }
    }
    if (result.status === "error") process.exit(2);
  }
}

async function cancelRun(apiKey, agentId, runId) {
  await using agent = await Agent.resume(agentId, { apiKey });
  const run = await Agent.getRun(runId, {
    runtime: "cloud",
    agentId,
    apiKey,
  });
  if (!run.supports("cancel")) {
    console.error(`Cancel not supported: ${run.unsupportedReason?.("cancel") ?? "unknown"}`);
    process.exit(1);
  }
  await run.cancel();
  console.log(`Cancelled run ${runId}`);
}

async function main() {
  if (values.list) {
    const items = await listRunSessions(cwd);
    if (items.length === 0) {
      console.log("No saved sessions. Start one with: npm run implement -- --cloud");
      return;
    }
    for (const item of items) {
      console.log(
        `${item.savedAt ?? item.startedAt}\t${item.agentId}\t${item.runId}\t${item._path}`,
      );
    }
    return;
  }

  const apiKey = await requireApiKey();
  const { agentId, runId, sessionPath } = await resolveTarget();

  if (values.cancel) {
    await cancelRun(apiKey, agentId, runId);
    return;
  }

  if (values.follow) {
    await followRun(apiKey, agentId, runId);
    return;
  }

  if (values.watch) {
    const intervalMs = Math.max(5, Number(values.interval) || 15) * 1000;
    printMonitorLinks({ agentId, runId, sessionPath });
    for (;;) {
      await printStatus(apiKey, agentId, runId);
      const run = await fetchCloudRun(apiKey, agentId, runId);
      const status = String(run.status ?? "").toUpperCase();
      if (TERMINAL_RUN_STATUSES.has(status)) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return;
  }

  if (values.status || (!values.follow && !values.watch && !values.list)) {
    printMonitorLinks({ agentId, runId, sessionPath });
    await printStatus(apiKey, agentId, runId);
    return;
  }
}

main().catch((err) => {
  if (err instanceof CursorAgentError) {
    console.error(`Cursor error: ${err.message} (retryable=${err.isRetryable})`);
    process.exit(1);
  }
  if (err.code === "ENOENT") {
    console.error(err.message);
    console.error("No session yet. Run: npm run implement -- --cloud --detach");
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
