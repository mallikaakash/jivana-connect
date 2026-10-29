export function cloudAgentWebUrl(agentId) {
  return `https://cursor.com/agents/${agentId}`;
}

export function cloudAgentDesktopUrl(agentId) {
  return `cursor://anysphere.cursor-deeplink/background-agent?bcId=${encodeURIComponent(agentId)}`;
}

export function printMonitorLinks({ agentId, runId, sessionPath }, out = process.stderr) {
  out.write(`\n--- monitor ---\n`);
  out.write(`web:     ${cloudAgentWebUrl(agentId)}\n`);
  out.write(`desktop: ${cloudAgentDesktopUrl(agentId)}\n`);
  out.write(`agent:   ${agentId}\n`);
  out.write(`run:     ${runId}\n`);
  if (sessionPath) {
    out.write(`session: ${sessionPath}\n`);
  }
  out.write(`follow:  npm run monitor -- --follow\n`);
  out.write(`status:  npm run monitor -- --status\n`);
  out.write(`---------------\n\n`);
}
