const API_BASE = "https://api.cursor.com/v1";

function authHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function fetchCloudAgent(apiKey, agentId) {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}`, {
    headers: { Authorization: authHeader(apiKey) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET agent failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function fetchCloudRun(apiKey, agentId, runId) {
  const res = await fetch(
    `${API_BASE}/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    { headers: { Authorization: authHeader(apiKey) } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET run failed (${res.status}): ${body}`);
  }
  return res.json();
}
