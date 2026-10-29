import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RUNS_DIR = ".cursor/runs";

export function runsDirectory(cwd) {
  return path.join(cwd, RUNS_DIR);
}

export async function saveRunSession(cwd, session) {
  const dir = runsDirectory(cwd);
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${stamp}-${session.agentId}.json`;
  const filePath = path.join(dir, fileName);
  const latestPath = path.join(dir, "latest.json");

  const payload = {
    ...session,
    savedAt: new Date().toISOString(),
  };

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(latestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return { filePath, latestPath };
}

export async function loadRunSession(cwd, sessionPath) {
  const resolved =
    sessionPath ??
    path.join(runsDirectory(cwd), "latest.json");
  const text = await readFile(resolved, "utf8");
  return { ...JSON.parse(text), _path: resolved };
}

export async function listRunSessions(cwd, limit = 10) {
  const dir = runsDirectory(cwd);
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const files = names
    .filter((n) => n.endsWith(".json") && n !== "latest.json")
    .sort()
    .reverse()
    .slice(0, limit);

  const items = [];
  for (const name of files) {
    const filePath = path.join(dir, name);
    const text = await readFile(filePath, "utf8");
    items.push({ ...JSON.parse(text), _path: filePath });
  }
  return items;
}
