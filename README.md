# Jivana Connect

**Every patient connected. Every follow-up accounted for.**

**Live demo:** https://jivana-connect.vercel.app

Jivana Connect is an AI-powered patient follow-up and care-coordination workspace for clinics, built for the Bolna Symphony Buildathon. **Jiya**, a Hindi / Hinglish / English voice agent on [Bolna](https://www.bolna.ai), calls patients about appointment confirmations, test reminders, post-procedure check-ins and clinician-assigned tasks. A FastAPI backend validates each call result and applies the workflow rules. Clinic staff use the dashboard to see what needs attention and take the next step.

> CALL → UNDERSTAND → EXTRACT → VALIDATE → UPDATE → TAKE THE NEXT ACTION

The hosted demo runs in **offline mock mode**: synthetic patient data, with calls simulated in the browser. Try it: **Tasks → Confirm cardiology appointment (Asha Verma) → Start Jiya call**. After about 8 seconds the call completes, the task moves to *Awaiting staff action*, and the appointment's booking stays unchanged until staff rebook. Jiya never diagnoses, prescribes or changes bookings; concerns are routed to humans.

## Repo layout

| Path | What |
|---|---|
| `frontend/` | React + TypeScript + Vite + Tailwind staff dashboard (overview, tasks, patients, appointments, calls, escalations, settings) |
| `backend/` | FastAPI workflow service: simulated or live Bolna calls, idempotent webhook, in-memory store (optional MongoDB). See `backend/README.md` |
| `shared/seed.json` | Synthetic demo dataset used by both sides |
| `docs/CONTRACT.md` | Single source of truth for statuses, record shapes, workflow rules and the API |
| `docs/Jivana_Connect_UI_Frontend_Specification.pdf` | Product / UI spec |
| `backend/bolna/` | Jiya prompt and extraction drafts |

## Run locally

```bash
# backend → http://localhost:8000
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000

# frontend → http://localhost:5173 (proxies /api to the backend)
cd frontend && npm install && npm run dev

# frontend only, no backend
cd frontend && VITE_API_MODE=mock npm run dev
```

Calls are simulated unless `BOLNA_API_KEY`, `BOLNA_AGENT_ID` and `DEMO_CALL_RECIPIENT` are set in `backend/.env` (see `backend/.env.example`).

## Deploy

- **Frontend:** Vercel. Run `VITE_API_MODE=mock npx vite build` in `frontend/`, then `vercel deploy --prod` from the build output. That folder needs a `vercel.json` with a catch-all rewrite to `/index.html` so deep links work.
- **Backend:** Google Cloud Run, using the root `Dockerfile` (`gcloud run deploy jivana-api --source . --no-cpu-throttling --min-instances=1 --max-instances=1`). The always-on, single-instance flags keep simulated calls, Bolna polling and the in-memory store working.

---

# Spec-driven implementation tooling

Programmatic spec implementation — **Cursor Cloud** (with monitoring) or **Claude Code** locally.

### Quick start (Cursor Cloud)

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

### Monitor a cloud run

```bash
npm run monitor -- --status          # one-shot JSON status (REST)
npm run monitor -- --follow          # stream logs until done
npm run monitor -- --watch           # poll every 15s until terminal
npm run monitor -- --list            # recent sessions
```

Open the printed web link in the browser to watch conversation, diffs, and artifacts in the Cursor Cloud Agents UI. In Cursor Web, use **Filter → Source → SDK** if you do not see SDK-started agents.

### Stay attached (stream in terminal)

```bash
npm run implement -- --cloud --spec docs/SPEC.md
```

Optional: `--auto-pr` to open a PR when the agent finishes.

### Local engines

```bash
npm run implement -- --engine cursor --spec docs/SPEC.md   # local Cursor agent
npm run implement -- --engine claude --spec docs/SPEC.md     # Claude Code CLI
```

See `AGENTS.md` and `npm run implement -- --help`.
