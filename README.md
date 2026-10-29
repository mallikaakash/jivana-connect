# Clini-AI

Programmatic spec implementation — **Cursor Cloud** (with monitoring) or **Claude Code** locally.

## Quick start (Cursor Cloud)

1. Copy `docs/SPEC.template.md` → `docs/SPEC.md` and write your spec (full text is sent in the prompt; pushing to GitHub is still recommended for the cloud checkout).
2. `npm install`
3. **One-time auth** (same Cursor account as the cloud repo — not a separate product):

```bash
npm run cursor:login
```

Optional: `CURSOR_API_KEY` from Integrations instead.

4. Kick off a cloud run:

```bash
npm run implement:cloud
# or
npm run implement -- --cloud --detach --spec docs/SPEC.md
```

The CLI prints a **web URL** (`https://cursor.com/agents/bc-...`), saves `.cursor/runs/latest.json`, and tells you how to follow logs.

## Monitor a cloud run

```bash
npm run monitor -- --status          # one-shot JSON status (REST)
npm run monitor -- --follow          # stream logs until done
npm run monitor -- --watch           # poll every 15s until terminal
npm run monitor -- --list            # recent sessions
```

Open the printed web link in the browser to watch conversation, diffs, and artifacts in the Cursor Cloud Agents UI. In Cursor Web, use **Filter → Source → SDK** if you do not see SDK-started agents.

## Stay attached (stream in terminal)

```bash
npm run implement -- --cloud --spec docs/SPEC.md
```

Optional: `--auto-pr` to open a PR when the agent finishes.

## Local engines

```bash
npm run implement -- --engine cursor --spec docs/SPEC.md   # local Cursor agent
npm run implement -- --engine claude --spec docs/SPEC.md     # Claude Code CLI
```

See `AGENTS.md` and `npm run implement -- --help`.
