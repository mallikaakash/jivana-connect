# Using Jivana Connect in a real clinic (day one)

**App URL (bookmark on front-desk + doctor devices):**  
[https://project-bf77a013-c0b3-413c-a75.web.app](https://project-bf77a013-c0b3-413c-a75.web.app)

Two **roles** in the header — same login, different screens:

| Role | Who | Main job |
|------|-----|----------|
| **Doctor** | Clinician / lead | Review patient questions and concerns from Jiya calls; resolve escalations with a note |
| **Front desk** | Coordinator / reception | Register patients, book appointments, place follow-up calls, read outcomes |

Sign-in today: **Sign in with Google** (clinic staff Google accounts). No shared “access key” unless your admin set one.

---

## Front desk — typical day

1. **Sign in** → toggle **Front desk**.
2. **Today** — **Operations inbox**: reschedules, callbacks, overdue follow-ups.
3. **Patients → Register patient**
   - Real **mobile (E.164)**, e.g. `+919876543210`
   - **Consent to voice contact** must be checked (legal + product rule).
4. **Book appointment** (patient page or Appointments) — optional confirmation call task is created.
5. **Tasks & follow-ups** — open task → **Start Jiya call** (or wait for **auto-dial** if enabled).
6. After the call: **Calls** — read summary and extracted fields; task moves to next action.
7. **Escalations** — operational items; clinical ones appear on the doctor side too.
8. **Settings → Exports** — CSV if you need a list for the day.

**Calls ring the number on the patient record** — not a demo phone. Bolna must be allowed to dial those numbers on your account.

---

## Doctor — typical day

1. **Sign in** → toggle **Doctor**.
2. **Today** — **Clinical inbox** (questions, concerns from calls).
3. **Clinical review** — open escalation → read snippet / transcript → **Acknowledge** → **Resolve** with resolution type + note (required).
4. **Patients / Calls** — context only (no starting calls from task screen in doctor mode).
5. **Appointments** — read-only schedule view.

---

## What Jiya does vs staff

| Jiya (voice) | Staff (app) |
|--------------|-------------|
| Calls patient, confirms / reminds / checks in | Registers patient, writes **call context**, starts call |
| Extracts outcomes (confirm, reschedule, concern, etc.) | Reviews inbox, calls patient back if needed |
| Never changes appointment in a booking system | Cancels / updates appointment in app if needed |
| Escalates clinical questions | Doctor resolves with documented note |

---

## Before doors open (admin checklist)

- [ ] One **test call** to a real staff mobile registered as a patient — end-to-end in **Calls**.
- [ ] Bolna webhook still points at Cloud Run (see Settings → integrations / Bolna dashboard).
- [ ] **No** `CLINIC_DIAL_OVERRIDE_E164` in production (unless you intentionally ring one test number).
- [ ] MongoDB Atlas reachable (health shows `storage: live`).
- [ ] Staff know the **bookmark URL** and use **Google sign-in**.
- [ ] Optional: set `CLINIC_LEAD_NAME` / `CLINIC_NAME` on server for correct labels (already in env if deployed).

---

## Limits (be transparent with the clinic)

- Not a full EMR — no HL7/FHIR sync; appointments live in this app + MongoDB.
- Not a certified HIPAA BAA product — treat as operational workflow + consent; PHI in MongoDB and Bolna per your agreements.
- **Auto-dial** runs one call at a time on a single Cloud Run instance — fine for small daily volume.
- Bolna **outbound allowlist** — if calls fail, check Bolna account can dial patient mobiles (not hackathon trial limits).

---

## If something breaks during the day

| Symptom | Check |
|---------|--------|
| Can’t sign in | Pop-ups allowed; Google account; [Firebase authorized domains](https://console.firebase.google.com/project/project-bf77a013-c0b3-413c-a75/authentication/settings) |
| Call won’t start | Patient consent; opt-out; Bolna balance; phone E.164 |
| Call stuck “in progress” | **Calls** → **Mark complete** (staff override) or wait for webhook |
| Empty dashboard after login | API health: `/api/health` |

Support contact: whoever manages `backend/.env.gcp` and Bolna dashboard.
