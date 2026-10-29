export function formatStreamEvent(event, { textOut = process.stdout, logOut = process.stderr } = {}) {
  if (!event || typeof event !== "object") return;

  switch (event.type) {
    case "assistant":
      for (const block of event.message?.content ?? []) {
        if (block.type === "text" && block.text) {
          textOut.write(block.text);
        }
      }
      break;
    case "status":
      logOut.write(
        `[cloud ${event.status}]${event.message ? ` ${event.message}` : ""}\n`,
      );
      break;
    case "tool_call":
      logOut.write(
        `[tool ${event.status ?? "update"}] ${event.name ?? "unknown"}\n`,
      );
      break;
    case "usage":
      logOut.write(
        `[usage] input=${event.usage?.inputTokens ?? "?"} output=${event.usage?.outputTokens ?? "?"}\n`,
      );
      break;
    case "task":
      if (event.text || event.status) {
        logOut.write(`[task ${event.status ?? ""}] ${event.text ?? ""}\n`);
      }
      break;
    default:
      break;
  }
}

export async function streamRun(run, sinks) {
  for await (const event of run.stream()) {
    formatStreamEvent(event, sinks);
  }
}
