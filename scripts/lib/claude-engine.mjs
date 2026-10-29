import { spawn } from "node:child_process";

function parseStreamJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractTextFromEvent(event) {
  if (!event || typeof event !== "object") return "";
  if (event.type === "assistant" && event.message?.content) {
    return event.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (event.type === "result" && typeof event.result === "string") {
    return event.result;
  }
  return "";
}

export function runClaudeEngine({
  cwd,
  prompt,
  claudeBin = "claude",
  permissionMode = "acceptEdits",
  outputFormat = "stream-json",
  extraArgs = [],
}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      outputFormat,
      "--permission-mode",
      permissionMode,
      ...extraArgs,
    ];

    const child = spawn(claudeBin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    let finalResult = null;
    let buffer = "";

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseStreamJsonLine(line);
        if (!event) continue;
        if (event.type === "result") {
          finalResult = event;
        }
        const text = extractTextFromEvent(event);
        if (text) process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(
          `Claude Code exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
        );
        err.code = "CLAUDE_EXIT";
        err.exitCode = code;
        reject(err);
        return;
      }
      if (finalResult?.is_error) {
        const err = new Error(finalResult.result ?? "Claude Code run failed");
        err.code = "CLAUDE_RUN_FAILED";
        reject(err);
        return;
      }
      resolve({
        sessionId: finalResult?.session_id,
        result: finalResult?.result,
        status: finalResult?.subtype ?? "success",
      });
    });
  });
}
