# Deploy clinic stack on GCP (Cloud Run + Atlas + Vercel)

Production layout for **`JIVANA_MODE=clinic`**:

| Piece | Where | Why |
|-------|--------|-----|
| FastAPI API | **Cloud Run** (root `Dockerfile`) | Bolna webhooks, auto-dial scheduler, single worker |
| MongoDB | **MongoDB Atlas** (or other hosted Mongo) | Cloud Run cannot reach `localhost:27017` |
| Staff UI | **Firebase Hosting** (`firebase.json`, project `project-bf77a013-c0b3-413c-a75`) | Static Vite build, `VITE_API_BASE` → Cloud Run URL |

The API must run **one instance** with **CPU always allocated** so background polling, simulated jobs (demo only), clinic auto-dial, and stuck-call recovery stay in one process.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster (any region close to `asia-south1` if you deploy there).
2. **Database user** with read/write on database `jivana` (or your `MONGO_DB`).
3. **Network access:** allow Cloud Run egress. Simplest first deploy: **`0.0.0.0/0`** (restrict later with Atlas Private Endpoints + VPC if needed).
4. Copy the **SRV connection string**, e.g.  
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/jivana?retryWrites=true&w=majority`

Optional: export local dev data before switching:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/jivana" --out=/tmp/jivana-dump
mongorestore --uri="mongodb+srv://..." /tmp/jivana-dump/jivana
```

---

## 2. Production env file (never commit)

Copy and fill:

```bash
cp backend/.env.gcp.example backend/.env.gcp
```

Required for clinic on Cloud Run:

- `JIVANA_MODE=clinic`
- `MONGO_URL` — Atlas SRV string (**not** `127.0.0.1`)
- `CLINIC_NAME`, optional `CLINIC_LEAD_NAME`, optional `CLINIC_API_KEY` (staff Bearer gate)
- `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, optional `BOLNA_FROM_NUMBER`
- `BOLNA_WEBHOOK_SECRET` — required in clinic mode; use in Bolna webhook URL
- `CORS_ORIGINS` — comma-separated **frontend origin(s)** (Firebase: `https://project-bf77a013-c0b3-413c-a75.web.app,https://project-bf77a013-c0b3-413c-a75.firebaseapp.com`)
- `AUTO_DIAL_ENABLED` — defaults to on in clinic; set `false` to disable
- `PUBLIC_BASE_URL` — leave empty on first deploy; the deploy script sets it to the Cloud Run URL on the second pass

Do **not** set `DEMO_CALL_RECIPIENT` for clinic (calls use patient phones).

---

## 3. Deploy API to Cloud Run

Prerequisites:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

From repo root:

```bash
chmod +x scripts/deploy-gcp-clinic.sh
./scripts/deploy-gcp-clinic.sh
```

Defaults: service **`jivana-clinic-api`**, region **`asia-south1`**. Override:

```bash
GCP_PROJECT=... GCP_REGION=europe-west1 SERVICE_NAME=jivana-clinic-api ./scripts/deploy-gcp-clinic.sh
```

The script:

1. Refuses `MONGO_URL` pointing at localhost.
2. Builds and deploys from the root `Dockerfile` with `--no-cpu-throttling --min-instances=1 --max-instances=1`.
3. Sets `PUBLIC_BASE_URL` to the service URL and redeploys so Bolna webhook URLs are stable.

Verify:

```bash
curl -sS "https://YOUR-SERVICE-xxx.a.run.app/api/health"
curl -sS "https://YOUR-SERVICE-xxx.a.run.app/api/meta" | jq .
```

Expect `jivana_mode: clinic`, `storage` showing Mongo connected, `auto_dial_enabled` as configured.

---

## 4. Bolna webhook

In Bolna (Jiya agent), set webhook to:

```text
https://YOUR-SERVICE-xxx.a.run.app/api/webhooks/bolna?token=YOUR_BOLNA_WEBHOOK_SECRET
```

Must match `BOLNA_WEBHOOK_SECRET` on Cloud Run. Webhook route is **unauthenticated** (token query param only).

If you use a firewall in front of Cloud Run, allow Bolna POST sources: `13.203.39.153`, `13.126.9.249`, `13.202.133.53`.

Post-deploy check: `API_BASE=https://YOUR-SERVICE-xxx.a.run.app ./scripts/smoke-prod.sh`

---

## 5. Frontend (Firebase Hosting)

One-time: **`npx firebase-tools@13 login`** (see [YOUR_TURN_SETUP.md](./YOUR_TURN_SETUP.md)).

Deploy API + UI together:

```bash
npm run deploy:clinic
```

Or UI only (after API exists):

```bash
npm run deploy:hosting
```

The hosting script builds with `VITE_JIVANA_MODE=clinic`, `VITE_API_BASE` = Cloud Run URL, then `firebase deploy --only hosting`.

Live URLs:

- https://project-bf77a013-c0b3-413c-a75.web.app  
- https://project-bf77a013-c0b3-413c-a75.firebaseapp.com  

If `CLINIC_API_KEY` is set, staff sign in once in the UI; the key is sent as `Authorization: Bearer …` on API calls.

---

## 6. Secret Manager (optional hardening)

For teams, store sensitive vars in Secret Manager and map them on deploy:

```bash
printf '%s' "$BOLNA_API_KEY" | gcloud secrets create jivana-bolna-api-key --data-file=-
# ... repeat for MONGO_URL, BOLNA_WEBHOOK_SECRET, CLINIC_API_KEY
```

Then extend `scripts/deploy-gcp-clinic.sh` with `--set-secrets` (see [Cloud Run secrets](https://cloud.google.com/run/docs/configuring/secrets)). The default script uses `backend/.env.gcp` only on your machine and does not upload it to git.

---

## 7. Operations checklist

| Check | Command / action |
|-------|------------------|
| Health | `GET /api/health` |
| Mode & features | `GET /api/meta` |
| Webhook reachability | Bolna test call or `curl -X POST` (see `backend/README.md`) |
| Auto-dial | `meta.auto_dial_enabled`; one active call at a time |
| Logs | `gcloud run services logs read jivana-clinic-api --region=asia-south1 --limit=50` |

---

## Troubleshooting

- **Startup crash / “MongoDB required” in clinic** — `MONGO_URL` missing or Atlas IP block.
- **401 on API** — set `CLINIC_API_KEY` in UI or unset key for open API (not recommended).
- **CORS errors in browser** — frontend origin missing from `CORS_ORIGINS`.
- **Webhooks ignored** — wrong `PUBLIC_BASE_URL`, wrong token, or Bolna pointing at old ngrok URL.
- **Duplicate auto-dial** — ensure `max-instances=1` (script enforces this).
