import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_INSTRUCTIONS = `You are implementing a product spec in this repository.

Rules:
- Read the spec carefully and implement it end-to-end.
- Match existing project conventions; keep diffs focused.
- Run relevant checks (tests, lint, typecheck) if the repo has them.
- Do not commit unless the user or run configuration explicitly asks you to.
- Summarize what you built and any follow-ups at the end.`;

export async function loadSpec(specPath, cwd) {
  const resolved = path.resolve(cwd, specPath);
  const text = await readFile(resolved, "utf8");
  if (!text.trim()) {
    throw new Error(`Spec file is empty: ${resolved}`);
  }
  return { path: resolved, text };
}

export function buildImplementationPrompt({ specPath, specText, extraInstructions }) {
  const instructions = extraInstructions?.trim() || DEFAULT_INSTRUCTIONS;
  return `${instructions}

## Spec file
Path: ${specPath}

## Spec contents
${specText}`;
}

/** Shorter prompt for Claude Code — it can re-read the file from disk. */
export function buildClaudeCodePrompt({ specPath, extraInstructions }) {
  const instructions = extraInstructions?.trim() || DEFAULT_INSTRUCTIONS;
  return `${instructions}

Read the full spec at \`${specPath}\`, then implement it in this repository.`;
}
