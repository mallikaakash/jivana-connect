# Finish setup — only steps that need you in a browser

Everything else is implemented and deployable with `npm run deploy:clinic`.  
**Secret rotation is skipped** per your request.

---

## Already done for you (no action)

- Clinic API on Cloud Run, UI on Firebase Hosting  
- MongoDB Atlas wiring, Bolna webhook URL pattern  
- Patient edit, appointment cancel, staff call complete, CSV exports  
- Firebase web config in `frontend/.env.production` (local, gitignored)  
- API accepts Google ID tokens when `FIREBASE_PROJECT_ID` is set on Cloud Run  

---

## Step 1 — Turn on Google sign-in (required if you want “Sign in with Google”)

The button only works after you enable the provider once.

1. Open **[Firebase Authentication → Sign-in method](https://console.firebase.google.com/project/project-bf77a013-c0b3-413c-a75/authentication/providers)**.  
2. Click **Google**.  
3. Toggle **Enable**.  
4. Choose a **Project support email** (your Google account).  
5. Click **Save**.

Optional: add **[Authorized domains](https://console.firebase.google.com/project/project-bf77a013-c0b3-413c-a75/authentication/settings)** — `project-bf77a013-c0b3-413c-a75.web.app` is usually added automatically when Hosting is linked.

Then redeploy (or ask the agent to run): `npm run deploy:clinic`

Test: open **[https://project-bf77a013-c0b3-413c-a75.web.app](https://project-bf77a013-c0b3-413c-a75.web.app)** → **Sign in with Google**.

---

## Step 2 — Hackathon: one verified Bolna number for all calls (optional)

If judges only have one verified mobile on Bolna:

1. Edit **`backend/.env.gcp`** (on your Mac):

   ```bash
   CLINIC_DIAL_OVERRIDE_E164=+91XXXXXXXXXX
   ```

   Use E.164 (e.g. `+919876543210`).

2. Redeploy API only:

   ```bash
   npm run deploy:gcp
   ```

3. Confirm in app **Settings → Hackathon dial override: On**.

---

## Step 3 — Staff access key instead of Google (optional)

If you prefer a shared password instead of Google:

1. Pick a long random string.  
2. In **`backend/.env.gcp`**:

   ```bash
   CLINIC_API_KEY=your-chosen-key
   ```

3. Run `npm run deploy:gcp`.  
4. Staff open the hosted app and paste the key on **Clinic sign-in**.

You can use **both** Google and access key (`auth_methods` in `/api/meta`).

---

## Step 4 — GitHub “Deploy clinic” workflow (optional)

Only if you want one-click deploy from GitHub Actions.

1. Open **[GCP IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=project-bf77a013-c0b3-413c-a75)**.  
2. Create or select a service account with **Cloud Run Admin**, **Cloud Build Editor**, **Artifact Registry Administrator**, **Service Account User**.  
3. **Keys → Add key → JSON** — download once.  
4. In GitHub repo → **Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   |--------|--------|
   | `GCP_SA_KEY` | entire JSON file |
   | `FIREBASE_TOKEN` | from `firebase login:ci` on your machine |

5. Store **`backend/.env.gcp`** contents as secret `GCP_ENV_FILE` and adjust workflow to write it before deploy (or keep deploying locally with `npm run deploy:clinic`).

Workflow file: [`.github/workflows/deploy-clinic.yml`](../.github/workflows/deploy-clinic.yml) — run manually under **Actions**.

---

## Step 5 — Tighten MongoDB network (when leaving hackathon)

1. Open **[Atlas Network Access](https://cloud.mongodb.com/v2#/security/network/accessList)**.  
2. Remove **`0.0.0.0/0`** when you use **[Atlas + GCP private endpoint](https://www.mongodb.com/docs/atlas/security-private-endpoint/)** or a fixed egress IP.

---

## Not in this product (documented)

See **[OUT_OF_SCOPE.md](./OUT_OF_SCOPE.md)** — EHR sync, inbound line, SMS/email, multi-clinic, HIPAA BAA.

---

## Verify anytime

```bash
npm run smoke:prod
```

App: **[https://project-bf77a013-c0b3-413c-a75.web.app](https://project-bf77a013-c0b3-413c-a75.web.app)**  
API: **https://jivana-clinic-api-156663966842.asia-south1.run.app/api/health**
