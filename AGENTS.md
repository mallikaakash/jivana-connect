# Agent instructions (Clini-AI)

## Spec-driven implementation (Cursor Cloud)

Preferred flow for long builds you can monitor in the browser:

1. Ensure `docs/SPEC.md` exists (copy from `docs/SPEC.template.md`).
2. Set `CURSOR_API_KEY` (Dashboard → Integrations).
3. Start a detached cloud run:

```bash
npm install
export CURSOR_API_KEY="cursor_..."
npm run implement:cloud
```

4. Monitor:

```bash
npm run monitor -- --follow     # terminal stream
npm run monitor -- --status     # JSON snapshot
npm run monitor -- --watch      # poll until done
```

Session metadata lives in `.cursor/runs/latest.json` (`agentId`, `runId`, web URL).

## Spec-driven implementation (local)

```bash
npm run implement -- --engine cursor --spec docs/SPEC.md
npm run implement -- --engine claude --spec docs/SPEC.md
```

## Engines

| Engine | When to use |
|--------|-------------|
| `cursor` + `--cloud` | Cursor Cloud VM against `origin` + current branch; monitor via web + `npm run monitor` |
| `cursor` (no `--cloud`) | Local `@cursor/sdk` agent on this checkout |
| `claude` | Claude Code `-p` on this machine |

Exit codes: `0` success, `1` startup/auth/config, `2` run failed after start.

## Cloud notes

- Spec body is embedded in the prompt so uncommitted `docs/SPEC.md` still works; push spec changes to GitHub when the agent should edit the same files on the remote branch.
- SDK-started cloud agents may require **Filter → Source → SDK** on [cursor.com/agents](https://cursor.com/agents).
- Use `--auto-pr` on implement for an automatic PR when the run completes.
