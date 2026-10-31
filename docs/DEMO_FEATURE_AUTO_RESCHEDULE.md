# Demo script — Auto-reschedule after confirmation call

**One feature:** Patient names a **new day** on Jiya’s appointment confirmation call → **old slot stays on the calendar as cancelled (grey)** → **new visit is booked** → confirmation call is **re-queued** for the day before (4 PM IST).

**App:** https://project-bf77a013-c0b3-413c-a75.web.app  
**Sign-in:** Hackathon reviewers key → **Front desk**  
**Runtime:** ~1:30–2:00 (one continuous story or 3 short clips)

---

## Before you record

1. **Phone:** Number in Bolna + on the patient chart (`+91…` E.164).
2. **Consent:** ✅ on the patient.
3. Prefer a **new name** (e.g. **Anita Mehta**) so Appointments isn’t cluttered — or reset workspace once off camera.
4. **Book the first visit at least 2 calendar days out** so “tomorrow” vs “day after tomorrow” is obvious on Appointments (e.g. book **Sun 1 Nov 4 PM**, reschedule to **Mon 2 Nov**).
5. One **live** call only — no simulated webhook on the same task.

---

## What the viewer should learn

| Before call | After call (clear new date) |
|-------------|-----------------------------|
| One row: **Scheduled**, confirmation **Pending** | **Two rows:** original day **Cancelled** (grey row, **red** “Cancelled” badge) + new day **Scheduled**, **Awaiting confirmation** |
| Task: **Pending** · Start Jiya call | Same task: **Pending** · **Awaiting call** · due **day before new visit @ 4 PM** |
| — | Extra “callback to pick a slot” tasks **closed** if the date was already clear |

**Not in this feature:** Vague lines (“Monday morning”, “next week”) → task stays **Staff action**; booking unchanged until desk acts.

---

## Scene A — Setup (0:00–0:35)

**On screen:** Front desk.

1. **Patients** → **Register patient**  
   - Name, age, gender, **+91…**, consent ✅  
2. **Appointments** → **Book appointment**  
   - Patient, **first visit date/time** (e.g. tomorrow 4:00 PM), department, clinician  
   - Leave **Create confirmation call task** checked → **Save**
3. **Tasks & follow-ups** → open **Confirm appointment — [that date]**  
   - Show **Pending**, purpose, **Start Jiya call**

**Voice-over (~20 sec):**

> Front desk books a visit. Jivana creates a confirmation task for Jiya. Nothing is manual on the calendar yet beyond that booking.

**Lower third:** `Book visit → Confirmation task`

---

## Scene B — Live call (0:35–1:15)

**On screen:** Task detail → **Start Jiya call** (phone on speaker or PiP).

**Patient lines (use a clear date):**

- “I can’t make it that day.”
- “Please move it to **2 November**” *(or “second November” / “3 November” — same idea)*

Let Jiya close the call naturally.

**Voice-over (optional, one line under call):**

> Real outbound call via Bolna; outcome and transcript land in the app when the call completes.

---

## Scene C — Proof (1:15–2:00)

**On screen — show in this order (~10 sec each):**

1. **Tasks** — same confirmation task  
   - Still **Pending** (not “staff rebook”)  
   - **Call result:** Patient asked to reschedule  
   - **Next action:** automatic confirmation on **[day before new visit] @ 4 PM**

2. **Appointments** — **this is the hero frame**  
   - **First day group:** grey row · **Booking: Cancelled** (red badge) · same clock time  
   - **New day group:** **Scheduled** · **Awaiting confirmation** · same time of day  
   - No manual Cancel + Book clicks

3. **Calls** — latest call → **Outcome** + scroll **transcript** (2–3 lines)

4. *(Optional)* **Patients** → patient → **Next appointment** shows the **new** date

**Voice-over (~25 sec):**

> When Jiya hears a concrete new day, we don’t hide history: the original slot stays visible as **cancelled**. A **new** appointment is created on the patient’s preferred day, and the confirmation call is scheduled for the afternoon before — same workflow the clinic would run anyway, without desk staff re-entering the booking.

**Lower third:** `Old slot cancelled · New visit booked · Confirmation re-queued`

---

## Close (2:00–2:10)

**On screen:** Appointments both rows in one frame, or split before/after.

**Voice-over (~10 sec):**

> One voice call updates the calendar, the task queue, and the audit trail — structured for front desk and doctors in Jivana Connect.

---

## Checklist (pass/fail before you ship the clip)

- [ ] Old date row exists, **grey**, booking **Cancelled** in **red**
- [ ] New date row **Scheduled**, confirmation **Awaiting confirmation**
- [ ] You did **not** click Cancel / Book on Appointments for the reschedule
- [ ] Task due date matches **day before new visit, 4 PM IST**
- [ ] Transcript visible on **Calls** for the same task

---

## Fallback if the date wasn’t parsed

If the patient only said “next week” or “Monday morning”:

- Show **Tasks** → **Staff action needed** and **Appointments** unchanged — one sentence: *“Clear dates automate; vague windows stay with the desk.”*

That’s a separate 15-second B-roll, not this feature’s happy path.
