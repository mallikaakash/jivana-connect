# Clinic scheduling — daily Bolna confirmation batch

Phase 1 (implemented): **Bolna batches** place tomorrow’s appointment confirmation calls; **Jivana** still applies business rules in `process_call_result` when webhooks arrive.

## How it works for staff

1. Front desk **books an appointment** in Jivana.
2. A **confirmation task** is created automatically. It is **not** called immediately.
3. **Every day at `CLINIC_CONFIRMATION_BATCH_TIME` (default 10:00 IST)**, the API builds one **Bolna batch** for all patients with appointments **the next calendar day** and schedules it.
4. Outcomes appear in **Today**, **Calls**, and **Appointments** (confirmation state) — same as before.

**Other task types** (post-procedure, test reminder, callbacks): staff use **Tasks → Start Jiya call**, or a **manual batch** on the Batches page.

**Auto-dial** (old loop every 2 minutes) is **off by default** when daily confirmation batch is enabled.

---

## Environment variables (`backend/.env.gcp`)

| Variable | Default (clinic) | Meaning |
|----------|------------------|---------|
| `CLINIC_DAILY_CONFIRMATION_BATCH` | `true` | Enable daily batch + disable default auto-dial |
| `CLINIC_CONFIRMATION_BATCH_TIME` | `10:00` | IST time (hour:minute) the scheduler runs |
| `AUTO_DIAL_ENABLED` | `false` when daily batch on | Legacy per-task polling dial |
| `BOLNA_CALL_RETRY_ENABLED` | `false` | Phase 2: Bolna retries no-answer/busy on **single** `/call` |
| `CLINIC_CRON_SECRET` | (unset) | Secret for Cloud Scheduler HTTP trigger |
| `PUBLIC_BASE_URL` | Cloud Run URL | Required for batch webhooks |

Redeploy API after changing env: `./scripts/deploy-gcp-clinic.sh`

---

## Manual run (front desk)

1. Sign in to [the clinic app](https://project-bf77a013-c0b3-413c-a75.web.app).
2. **Batches** → **Tomorrow’s appointment confirmations** → **Run today’s confirmation batch now**  
   (Use if the automatic run was missed or for a demo.)

---

## Cloud Scheduler (recommended for production)

So confirmations run even if nobody opens the app:

1. Open [Google Cloud Scheduler](https://console.cloud.google.com/cloudscheduler?project=project-bf77a013-c0b3-413c-a75).
2. **Create job**
   - **Name:** `jivana-daily-confirmation`
   - **Frequency:** `0 10 * * *` (10:00 daily) — timezone **Asia/Kolkata**
   - **Target:** HTTP  
   - **URL:** `https://YOUR-CLOUD-RUN-URL/api/clinic/cron/daily-confirmation-batch`  
     (same host as `/api/health`, e.g. `https://jivana-clinic-api-2lcs3sivbq-el.a.run.app/...`)
   - **Method:** POST
   - **Header:** `X-Clinic-Cron-Secret: YOUR_CLINIC_CRON_SECRET` (must match `CLINIC_CRON_SECRET` in `.env.gcp`)
3. Save. Test with **Run now**.

**Note:** The in-process scheduler also fires at `CLINIC_CONFIRMATION_BATCH_TIME` while Cloud Run is **warm**. Cloud Scheduler is the reliable backup when instances scale to zero.

---

## Bolna dashboard (your steps)

| Step | Link / action |
|------|----------------|
| Agent webhook | [Bolna Agent Studio → Jiya](https://platform.bolna.ai) — webhook = `{PUBLIC_BASE_URL}/api/webhooks/bolna?token={BOLNA_WEBHOOK_SECRET}` |
| Verify batches | Bolna **Batches** + Jivana **Batches** list |
| Call history | Bolna **Monitor → Call History** if a patient says they were not called |
| Phone numbers | **My Numbers** — outbound must be allowed for patient mobiles (trial limits apply) |

Phase 3 (not implemented): Bolna **Workflows** for in-call branching — rules stay in Jivana until you migrate them.

---

## API (for debugging)

- `GET /api/clinic/daily-confirmation-batch/preview` — who would be called for tomorrow
- `POST /api/clinic/daily-confirmation-batch/run` — staff auth — create + schedule batch now
- `POST /api/clinic/cron/daily-confirmation-batch` — header `X-Clinic-Cron-Secret` only (no staff token)
