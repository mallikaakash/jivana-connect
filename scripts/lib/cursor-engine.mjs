import { Agent, CursorAgentError } from "@cursor/sdk";
import { printMonitorLinks } from "./cloud-links.mjs";
import { saveRunSession } from "./run-session.mjs";
import { formatStreamEvent } from "./monitor-stream.mjs";

export async function runCursorEngine({
  apiKey,
  cwd,
  prompt,
  modelId,
  cloudRepo,
  stream = true,
  settingSources = [],
  cloudOptions = {},
  detach = false,
  sessionMeta = {},
}) {
  const options = {
    apiKey,
    model: { id: modelId },
  };

  if (cloudRepo) {
    options.cloud = {
      repos: [
        {
          url: cloudRepo.url,
          startingRef: cloudRepo.ref ?? "main",
        },
      ],
      autoCreatePR: cloudOptions.autoCreatePR ?? false,
      skipReviewerRequest: cloudOptions.skipReviewerRequest ?? true,
      workOnCurrentBranch: cloudOptions.workOnCurrentBranch ?? false,
      metadata: cloudOptions.metadata,
    };
  } else {
    options.local = { cwd, settingSources };
  }

  await using agent = await Agent.create(options);

  const run = await agent.send(prompt);

  const session = {
    engine: "cursor",
    runtime: cloudRepo ? "cloud" : "local",
    agentId: agent.agentId,
    runId: run.id,
    repoUrl: cloudRepo?.url,
    repoRef: cloudRepo?.ref,
    specPath: sessionMeta.specPath,
    startedAt: new Date().toISOString(),
  };

  const { latestPath } = await saveRunSession(cwd, session);

  if (cloudRepo) {
    printMonitorLinks({
      agentId: agent.agentId,
      runId: run.id,
      sessionPath: latestPath,
    });
  } else {
    process.stderr.write(
      `cursor agent=${agent.agentId} run=${run.id} session=${latestPath}\n`,
    );
  }

  if (detach) {
    process.stderr.write(
      `[detach] Cloud run started; local process exiting. Monitor with npm run monitor -- --follow\n`,
    );
    return {
      ...session,
      status: "detached",
      sessionPath: latestPath,
    };
  }

  if (stream) {
    for await (const event of run.stream()) {
      formatStreamEvent(event);
    }
  }

  const result = await run.wait();

  if (result.status === "error") {
    const err = new Error(`Cursor run failed: ${run.id}`);
    err.code = "RUN_FAILED";
    err.runId = run.id;
    err.agentId = agent.agentId;
    throw err;
  }

  if (result.git?.branches?.length) {
    for (const branch of result.git.branches) {
      if (branch.prUrl) {
        process.stderr.write(`[git] pr=${branch.prUrl}\n`);
      } else if (branch.branch) {
        process.stderr.write(`[git] branch=${branch.branch}\n`);
      }
    }
  }

  return {
    agentId: agent.agentId,
    runId: run.id,
    status: result.status,
    result: result.result,
    sessionPath: latestPath,
    git: result.git,
  };
}

export function isCursorStartupError(err) {
  return err instanceof CursorAgentError;
}
