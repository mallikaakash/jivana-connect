# Jivana Connect

**Every patient connected. Every follow-up accounted for.**

Voice-first patient engagement for clinics — confirm appointments, run follow-ups, and capture concerns that need the care team, between visits and without every touchpoint requiring another trip to the chair.

| | |
|---|---|
| **Live app** | https://project-bf77a013-c0b3-413c-a75.web.app/ |
| **Pitch deck** | https://claude.ai/artifact/4VcbUERKZ1wxELpZZKPPzQ#slide-3dd33bdac6c2 |
| **Team** | Jivana Labs |

Built for the [Bolna Symphony Buildathon](https://www.bolna.ai). **Jiya** is our Hindi / Hinglish / English voice agent on [Bolna](https://www.bolna.ai). A **FastAPI** backend on Cloud Run validates call results and updates tasks, appointments, and escalations in **MongoDB**. Staff use the **React** dashboard (Firebase Hosting) for Today queues, tasks, calls, and clinical review.

> Call → extract → validate → update task → next action

## Try the demo (judges & reviewers)

1. Open the **[live app](https://project-bf77a013-c0b3-413c-a75.web.app/)**.
2. Click **Open clinic workspace** on the landing page (reviewer access is applied automatically).
3. If **Today** is empty, click **Load demo data** (or **Settings → Sample walkthrough data**).
4. Toggle **Front desk** vs **Doctor** in the header to see operations vs clinical workflows.

Suggested path: register a patient → book a dental appointment → **Tasks & Follow-ups** → **Start Jiya call** (live Bolna when configured) → **Calls** for transcript → **Clinical review** in Doctor mode.

More detail: [`docs/HACKATHON_REVIEWERS.md`](docs/HACKATHON_REVIEWERS.md) · demo script: [`docs/DEMO_VIDEO_5MIN_SCRIPT.md`](docs/DEMO_VIDEO_5MIN_SCRIPT.md)

## What’s in the repo

| Path | Purpose |
|------|---------|
| [`frontend/`](frontend/) | React + TypeScript + Vite staff UI (landing, Today, patients, tasks, appointments, calls, clinical review, settings) |
| [`backend/`](backend/) | FastAPI workflow service, Bolna webhooks, clinic mode + MongoDB |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | API and workflow contract |
| [`docs/CLINIC_PRODUCT.md`](docs/CLINIC_PRODUCT.md) | Clinic / doctor vs front desk behavior |
| [`docs/bolna/`](docs/bolna/) | Live Jiya config notes and [runbook](docs/bolna/LIVE_RUNBOOK.md) |
| [`shared/seed.json`](shared/seed.json) | Synthetic dataset for local mock mode |

## Run locally

```bash
# Backend → http://localhost:8000
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000

# Frontend → http://localhost:5173 (proxies /api to backend)
cd frontend && npm install && npm run dev

# Frontend only (mock API, no backend)
cd frontend && VITE_API_MODE=mock npm run dev
```

Live outbound calls need Bolna env vars in `backend/.env` (see `backend/.env.example` and `docs/bolna/LIVE_RUNBOOK.md`).

```bash
npm run test:ci    # backend pytest + frontend production build
npm run smoke:prod # after deploy (see scripts)
```

## Deploy (production clinic stack)

First-time GCP/Firebase/Atlas: [`docs/YOUR_TURN_SETUP.md`](docs/YOUR_TURN_SETUP.md) · finish checklist: [`docs/FINISH_SETUP.md`](docs/FINISH_SETUP.md)

```bash
npm run deploy:clinic   # Cloud Run API + Firebase Hosting (see docs/DEPLOY_GCP.md)
```

Hosted demo URL above uses this stack (not Vercel mock).

## Spec-driven agents (optional)

This repo includes Cursor / Claude tooling to implement from `docs/SPEC.md`. See [`AGENTS.md`](AGENTS.md) and `npm run implement -- --help`.

---

**Jivana Labs** · Jivana Connect
