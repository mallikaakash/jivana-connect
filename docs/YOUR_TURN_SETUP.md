# Your turn — two one-time setups (then we deploy everything)

The repo can deploy **Cloud Run API + Firebase Hosting UI** with:

```bash
npm run deploy:clinic
```

That command **will stop** until **`MONGO_URL`** in `backend/.env.gcp` is a real Atlas URI (see below). After that, the same command deploys API + frontend.

---

## 1. MongoDB Atlas (~10 minutes)

Cloud Run cannot reach your laptop’s Docker Mongo. You need a **hosted** cluster.

### 1a. Create account / cluster

1. Open **[MongoDB Atlas registration](https://www.mongodb.com/cloud/atlas/register)** (or sign in at **[cloud.mongodb.com](https://cloud.mongodb.com/)**).
2. Create a **free M0** cluster (any name, region near **Mumbai / asia-south1** if offered).
3. Wait until cluster status is **Active**.

### 1b. Database user

1. In Atlas: **Database Access** → **Add New Database User**.
2. Authentication: **Password**.
3. Username e.g. `jivana_app`, strong password (save in a password manager).
4. Privileges: **Read and write to any database** (or scoped to database `jivana`).
5. **Add User**.

### 1c. Network access (required for Cloud Run)

1. **Network Access** → **Add IP Address**.
2. Choose **Allow Access from Anywhere** (`0.0.0.0/0`) for the first deploy.  
   (You can tighten later with [Atlas + GCP private endpoints](https://www.mongodb.com/docs/atlas/security-private-endpoint/).)

### 1d. Connection string

1. **Database** → **Connect** → **Drivers**.
2. Copy the **SRV** string, e.g.  
   `mongodb+srv://jivana_app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
3. Edit it:
   - Replace `<password>` with your user password (URL-encode special characters if needed).
   - Add database name before `?`:  
     `...mongodb.net/jivana?retryWrites=true&w=majority`

### 1e. Paste into this repo

Open **`backend/.env.gcp`** (already gitignored) and set:

```bash
MONGO_URL=mongodb+srv://jivana_app:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/jivana?retryWrites=true&w=majority
```

**Optional — copy local patients (e.g. Asha Verma) to Atlas:**

```bash
mongodump --uri="mongodb://127.0.0.1:27017/jivana" --out=/tmp/jivana-dump
mongorestore --uri="YOUR_ATLAS_URI" /tmp/jivana-dump/jivana
```

(Requires [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) and local Mongo running.)

---

## 2. Firebase CLI login (~2 minutes)

Hosting deploy uses your Google account for project **`project-bf77a013-c0b3-413c-a75`**.

1. In a terminal:

```bash
cd /Users/violinadoley/Projects/clini-ai
npm install   # once, installs firebase-tools
npm run firebase:login
```

2. Complete the browser sign-in (same Google account that owns the GCP/Firebase project).
3. Confirm:

```bash
npx firebase projects:list
```

You should see **`project-bf77a013-c0b3-413c-a75`**.

**If Hosting was never enabled:** open **[Firebase Console](https://console.firebase.google.com/)** → your project → **Build** → **Hosting** → **Get started** (one click). No need to finish the wizard manually; our `firebase.json` deploys the app.

---

## 3. Tell the agent or run deploy yourself

When **`MONGO_URL`** is set and **`firebase login`** is done:

```bash
npm run deploy:clinic
```

Or ask in chat: *“MONGO_URL is set, firebase logged in — deploy clinic.”*

---

## After deploy (automatic checks)

| What | URL |
|------|-----|
| Staff UI | [https://project-bf77a013-c0b3-413c-a75.web.app](https://project-bf77a013-c0b3-413c-a75.web.app) |
| API health | `https://<cloud-run-url>/api/health` |
| Bolna webhook | Set in Bolna dashboard to `https://<cloud-run-url>/api/webhooks/bolna?token=<BOLNA_WEBHOOK_SECRET>` |

Bolna webhook docs: **[Bolna — webhooks](https://www.bolna.ai/docs)** (agent settings in [Bolna dashboard](https://platform.bolna.ai/)).

If **`CLINIC_API_KEY`** is set in `.env.gcp`, sign in on the hosted UI with that key.

---

## Already done for you in the repo

- `backend/.env.gcp` scaffolded from local Bolna/clinic vars (except Atlas `MONGO_URL`).
- **`CORS_ORIGINS`** preset for Firebase Hosting URLs.
- Cloud Run script: **`scripts/deploy-gcp-clinic.sh`** → service **`jivana-clinic-api`**, region **`asia-south1`**, single instance + always-on CPU.
- Firebase: **`.firebaserc`**, **`firebase.json`**, **`scripts/deploy-firebase-clinic.sh`**.

Full reference: **[DEPLOY_GCP.md](./DEPLOY_GCP.md)**.
