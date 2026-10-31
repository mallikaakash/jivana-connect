# Jivana Connect — 5-minute demo video (step-by-step)

**Live app:** https://project-bf77a013-c0b3-413c-a75.web.app  
**Sign-in:** Yellow **Hackathon & demo reviewers** box → **Fill access key** → **Continue**  
**Role:** **Front desk** for registration, calls, tasks · **Doctor** for clinical review (Scene 7)

**Total runtime target:** 5:00 (edit to length; record clips separately, not one take)

---

## Before you record (do this once, off camera)

1. **Phone:** Bolna-verified number you can answer (e.g. your mobile in E.164).
2. **Test two live calls** before filming:
   - Appointment → say you need to **reschedule**.
   - Test reminder → say **not yet / haven’t had time**.
3. Optional clean slate: ask your admin to reset demo workspace, or use a **brand-new patient name** so the list isn’t cluttered.
4. Prepare **one architecture slide** (Scene 8) in Keynote/Figma — text below.
5. Tools: screen recorder (1080p), subtitles in edit, quiet room.

**Do not** mix scripted fake webhooks with a live phone call during recording.

---

## Demo patient (fictional — use on camera)

| Field | Value |
|--------|--------|
| **Full name** | **Priya Nair** |
| **Age** | **34** (example) |
| **Gender** | **Female** |
| **Mobile** | Your verified `+91…` number |
| **Language** | English or Hinglish |
| **Consent** | ✅ Patient consents to follow-up voice calls |

---

## Master timeline (~5:00)

| Time | Scene | What happens |
|------|--------|----------------|
| 0:00–0:22 | 1 Hook | Title card → dashboard flash |
| 0:22–0:50 | 2 Register + book | New patient + tomorrow appointment |
| 0:50–1:05 | 3 Queue all follow-ups | Create 4 follow-up types (fast montage) |
| 1:05–1:15 | 4 Task setup | Open appointment confirmation task |
| 1:15–2:05 | 5 **Live call A** | Jiya appointment confirmation → reschedule |
| 2:05–2:45 | 6 Outcome A | Calls + Tasks + Appointments update |
| 2:45–3:15 | 7 **Live call B** | Test reminder → not done yet |
| 3:15–3:40 | 8 Outcome B + safety | Task pending; Doctor clinical review |
| 3:40–4:15 | 9 Architecture | Slide + voice-over |
| 4:15–5:00 | 10 Close | Today dashboard + title card |

---

## SCENE 1 — Hook (0:00–0:22)

**On screen:** Title card (5–8 sec), then slow pan **Front desk → Today**.

**Title card text:**

```text
JIVANA CONNECT
Every patient connected. Every follow-up accounted for.
AI-powered patient engagement and care coordination
```

**Voice-over (read at ~140 wpm):**

> Healthcare doesn’t end when the consultation ends. Patients still need appointment confirmations, test reminders, and follow-ups — and staff spend hours chasing responses. **Jivana Connect** turns those phone calls into structured, trackable workflows.

**Edit:** Fade title → app. Add subtitles.

---

## SCENE 2 — Register patient + book appointment (0:22–0:50)

**On screen:** Header **Front desk**.

### Steps (exact clicks)

1. **Patients** → **Register patient**
2. Fill:
   - Full name: **Priya Nair**
   - Age: **34** · Gender: **Female**
   - Mobile: **+91XXXXXXXXXX** (your verified number)
   - Preferred language: **English**
   - ✅ **Patient consents to follow-up voice calls**
3. **Save patient**
4. Open **Priya Nair** from the list
5. **Book appointment**
   - Patient: **Priya Nair**
   - Date/time: **Tomorrow, 4:00 PM** (pick in datetime picker)
   - Department: **General OPD**
   - Clinician: **Dr. Sharma**
   - ✅ Leave **Create confirmation call task** checked
6. **Save** → you land on (or navigate to) the new **Confirm appointment — …** task

**Voice-over:**

> We register a fictional patient with consent, book tomorrow’s visit, and Jivana Connect automatically creates a **pending confirmation call** for Jiya — our voice agent.

**On-screen text (lower third, 3 sec):**  
`Register → Book → Confirmation task created`

---

## SCENE 3 — Schedule all follow-up types (0:50–1:05)

**On screen:** Still on **Priya Nair** profile · **Schedule follow-up call** (repeat 4 times — **edit as fast montage**, ~3 sec each)

Create these **one after another** (same patient):

| # | Follow-up type | Title (suggested) | Visit details (paste in form) |
|---|----------------|-------------------|-------------------------------|
| 1 | **Test / report reminder** | Lipid profile reminder | Fasting lipid profile before cardiology review. Ask if test is done. |
| 2 | **Post-procedure check-in** | Post-visit follow-up call | Follow-up 48h after minor procedure. Ask how they feel; record concerns only. |
| 3 | **Clinician instruction reminder** | Bring prescriptions | Remind to bring prior prescriptions to tomorrow’s visit. |
| 4 | **Callback request** | Return patient call | Patient asked desk to call back this afternoon. |

For each: set **Due** = **today / now** (or next hour) so tasks appear in **Today** queue.

**Voice-over (over montage):**

> One agent, many workflows — appointment confirmations, tests, post-visit check-ins, clinician reminders, and callbacks. Each task carries **call context** Jiya uses on the outbound call.

**On-screen text:**  
`Five workflow types · One Jiya agent`

---

## SCENE 4 — Open the hero task (1:05–1:15)

**On screen:** **Tasks & follow-ups** → open **Confirm appointment — [tomorrow], 4:00 PM**

Show clearly:

- **Status:** Pending  
- **Purpose** / **Why Jiya is calling**  
- **Start Jiya call** button visible  

**Voice-over:**

> Here’s tomorrow’s confirmation — still **pending**. When we start the call, Bolna dials the patient’s number and Jiya runs with this context.

---

## SCENE 5 — Live call A — Appointment confirmation (1:15–2:05)

**On screen:** **Start Jiya call** → confirm → keep **task page** visible; picture-in-picture or split with phone on speaker.

**Overlay text (small, during call):**

```text
JIYA — OUTBOUND CALL
Patient: Priya Nair
Purpose: Appointment confirmation
Status: In progress
```

### Target dialogue (real call — words may vary slightly)

**Jiya:** Hello, I'm Jiya, the virtual assistant calling on behalf of your clinic. Am I speaking with Priya?

**You (patient):** Yes.

**Jiya:** I'm calling to confirm your appointment scheduled for tomorrow at 4 PM. Will you be able to attend?

**You:** Actually I have a conflict. I need to **reschedule**.

**Jiya:** *(records request)* … clinic team will follow up …

**Voice-over during call:** *(minimal — let audio breathe)*  
Optional one line: *“This is a real outbound call through Bolna — not a mock transcript.”*

**Edit:** Subtitles for Jiya + patient. Keep natural pauses.

---

## SCENE 6 — Outcome A — Dashboard proof (2:05–2:45)

**On screen (in order, ~8–10 sec each):**

1. **Tasks** — same task: **Awaiting staff action** or completed with outcome **Rescheduling requested**; read **Next action**
2. **Calls** — **All calls** → latest row → open → scroll **transcript** + **outcome**
3. **Appointments** — row for Priya:
   - **Booking:** Scheduled (unchanged)
   - **Confirmation:** Rescheduling requested
   - **Call note** / **Requested slot** if callback was created
4. **Today** — task in **Operations inbox**

**Voice-over:**

> After the call, the backend ingests Bolna’s result — webhook or poll — validates it, and updates MongoDB. The dashboard shows the structured outcome: **rescheduling requested**, booking unchanged until staff rebook, and a clear **next action** for front desk.

**On-screen text:**  
`Call → Extract → Validate → Update task → Show next action`

---

## SCENE 7 — Live call B — Test not done (2:45–3:15)

**On screen:** **Tasks** → **Lipid profile reminder** (pending) → **Start Jiya call**

### Target dialogue

**Jiya:** …check whether you've completed the test your clinician requested…

**You:** **Not yet. I haven’t had time.**

**Jiya:** …record that the test is still pending…

**Then show (no second call needed on camera if time tight):**

- Task stays **Pending** (not completed)
- **Next action** still staff-facing (e.g. remind again / check lab later)

**Voice-over:**

> The same pipeline handles test reminders. **Not done** stays **pending** — we don’t treat patient speech as “report received” or “clinician reviewed.”

---

## SCENE 8 — Human review + Doctor view (3:15–3:40)

**Option A (live, if you pre-tested):** Run **Post-visit follow-up call** once before filming; patient says: *“I’ve had some discomfort — should I change my medicine?”* → Jiya deflects advice, records concern → show **Doctor → Clinical review** with **Active** queue.

**Option B (faster for 5 min):** **Doctor** role → **Clinical review** → **Status: All** → show **resolved** history + say queue is clear when **Active** is empty.

**Voice-over (Scene 7 in PDF):**

> Jivana Connect supports clinical teams — it doesn’t replace them. Jiya records concerns and routes them for **human review**. It doesn’t diagnose or prescribe.

**On-screen text:**  
`Jiya records · Clinicians decide`

---

## SCENE 9 — Architecture (3:40–4:15)

**On screen:** Full-slide diagram (no code). Highlight flow with cursor or build animation.

**Slide text (copy-paste):**

```text
JIVANA CONNECT — ARCHITECTURE

┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  MongoDB    │◄───►│  FastAPI backend │◄───►│  Dashboard  │
│  patients   │     │  task eligibility│     │  (Firebase) │
│  tasks      │     │  workflow rules  │     │  staff UI   │
│  calls      │     │  ingest + audit  │     └─────────────┘
│  escalations│     └────────┬─────────┘
└─────────────┘              │
                             │ outbound + webhook
                             ▼
                    ┌──────────────────┐
                    │  Bolna — Jiya    │
                    │  voice · transcript│
                    │  · extractions   │
                    └──────────────────┘

Flow: Due task → Start call → Patient speaks → Result ingested → Task updated
```

**Voice-over:**

> Bolna handles the **voice conversation**. Our **FastAPI** backend owns **eligibility, validation, and workflow rules**. **MongoDB** stores patients, tasks, calls, and escalations. The **dashboard** gives staff one place to see outcomes and next actions — separate from the phone call itself.

---

## SCENE 10 — Close (4:15–5:00)

**On screen:** **Front desk → Today** (queue + recent calls) → title card (same as Scene 1).

**Voice-over:**

> With Jivana Connect, routine follow-ups become **structured workflows** — not lost phone calls. Our vision: less coordination overhead, more time for patient care. **Every patient connected. Every follow-up accounted for.**

---

## Checklist (day of shoot)

- [ ] Signed in · **Front desk**
- [ ] **Priya Nair** registered · consent **on**
- [ ] Tomorrow **4 PM** appointment + confirmation task **pending**
- [ ] Four other follow-up types created
- [ ] Live call A + B tested once off-camera
- [ ] Architecture slide exported (PNG/PDF)
- [ ] Subtitles exported with final MP4
- [ ] Total length 4:50–5:10 after trim

---

## If you run long (cut in this order)

1. Shorten Scene 3 montage (show 2 task types instead of 4)
2. Trim architecture to 20 sec
3. Use Option B for Scene 8 (resolved history only)
4. Shorten hook/close by 5 sec each

---

## Optional: Bolna B-roll (Scene 6 extra cred)

If you have Bolna console access, insert 5 sec of **execution + transcript** between call end and Jivana **Calls** screen — same story as PDF Scene 5.

---

## Verify after recording

```bash
./scripts/run-e2e-verified.sh
```

Submission blurb: see [HACKATHON_REVIEWERS.md](./HACKATHON_REVIEWERS.md).
