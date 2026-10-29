import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function resolveGitCloudTarget(cwd) {
  const { stdout: remoteOut } = await execFileAsync(
    "git",
    ["remote", "get-url", "origin"],
    { cwd },
  );
  const url = normalizeGitRemoteUrl(remoteOut.trim());

  let ref = "main";
  try {
    const { stdout: branchOut } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    const branch = branchOut.trim();
    if (branch && branch !== "HEAD") {
      ref = branch;
    }
  } catch {
    // detached HEAD or no commits — keep main
  }

  return { url, ref };
}

function normalizeGitRemoteUrl(raw) {
  if (raw.startsWith("git@")) {
    const match = /^git@([^:]+):(.+)$/.exec(raw);
    if (match) {
      return `https://${match[1]}/${match[2].replace(/\.git$/, "")}`;
    }
  }
  return raw.replace(/\.git$/, "");
}
