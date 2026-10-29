"""Scripted results for simulated voice mode (no Bolna credentials).

Uses the seed-only `demo_outcome` / `demo_extracted_fields` on a task when present, otherwise a
sensible default per workflow. Example transcripts are always flagged `transcript_is_example`.
"""

from __future__ import annotations

from . import timeutil

_BASE = {"callback_requested": False, "callback_window": None}

DEFAULT_FIELDS: dict[str, dict] = {
    "appointment_confirmation": {"appointment_outcome": "confirmed", "preferred_reschedule_window": None, "patient_note": None},
    "test_report_reminder": {"test_completed": True, "test_date": "Yesterday", "patient_note": None},
    "post_procedure_checkin": {"checkin_result": "routine_ok", "concern_summary": None},
    "clinician_task_reminder": {"task_acknowledged": True, "patient_note": None},
    "callback_request": {"patient_note": "Spoke with the patient in the requested window"},
}


def _fields_for_outcome(task_type: str, outcome: str) -> dict:
    fields = dict(DEFAULT_FIELDS.get(task_type, {}))
    if task_type == "appointment_confirmation":
        fields["appointment_outcome"] = outcome
        if outcome == "rescheduling_requested":
            fields["preferred_reschedule_window"] = "Next week, mornings"
    elif task_type == "test_report_reminder":
        fields["test_completed"] = outcome != "test_not_done"
        if outcome == "test_not_done":
            fields["test_date"] = None
    elif task_type == "post_procedure_checkin":
        fields["checkin_result"] = "concern_reported" if outcome == "concern_reported" else "routine_ok"
        if outcome == "concern_reported":
            fields["concern_summary"] = "Patient reports increased pain since this morning."
    elif task_type == "clinician_task_reminder":
        fields["task_acknowledged"] = outcome == "task_acknowledged"
    if outcome == "callback_requested":
        fields["callback_requested"] = True
        fields["callback_window"] = "Tomorrow, 4–6 PM"
    return fields


def simulated_result(task: dict | None) -> tuple[str, dict]:
    """Return (call_status, extracted_fields) for a simulated call."""
    if not task:
        return "completed", {}
    task_type = task["task_type"]
    outcome = task.get("demo_outcome")
    if outcome == "no_answer":
        return "no_answer", {}
    if task.get("demo_extracted_fields"):
        fields = {**_BASE, **task["demo_extracted_fields"]}
    elif outcome:
        fields = {**_BASE, **_fields_for_outcome(task_type, outcome)}
    else:
        fields = {**_BASE, **DEFAULT_FIELDS.get(task_type, {})}
    return "completed", fields


def _hindi(patient: dict | None) -> bool:
    return bool(patient) and patient.get("language") in ("hi", "hinglish")


def example_transcript(task: dict | None, patient: dict | None, appt: dict | None, status: str, ex: dict) -> list[dict]:
    if not task:
        return []
    hi = _hindi(patient)
    name = (patient or {}).get("display_name", "the patient")
    first = name.split(" ")[0]
    tt = task["task_type"]
    a = lambda text: {"role": "agent", "text": text}  # noqa: E731
    p = lambda text: {"role": "patient", "text": text}  # noqa: E731

    turns = [
        a(f"Namaste, main Jiya bol rahi hoon, Jivana clinic se. Kya meri baat {name} ji se ho rahi hai?" if hi
          else f"Hello, this is Jiya calling from Jivana clinic. Am I speaking with {name}?"),
        p("Haan ji, boliye." if hi else "Yes, speaking."),
    ]

    if tt == "appointment_confirmation":
        when = timeutil.human(appt["scheduled_at"]) if appt else "the scheduled time"
        dept = (appt or {}).get("department", task.get("department", "")).lower()
        doc = (appt or {}).get("clinician", "the doctor")
        turns.append(a(f"Aapka {doc} ke saath {dept} appointment {when} par hai. Kya aap aa payenge?" if hi
                       else f"You have a {dept} appointment with {doc} on {when}. Will you be able to attend?"))
        outcome = ex.get("appointment_outcome")
        if outcome == "rescheduling_requested":
            window = ex.get("preferred_reschedule_window") or "another day"
            note = ex.get("patient_note")
            turns.append(p(((f"Us din nahi ho payega — {note}. " if hi else f"I can't make it — {note.lower()}. ") if note else "")
                           + (f"Kya {window} ho sakta hai?" if hi else f"Could we do {window.lower()}?")))
            turns.append(a(f"Theek hai, main note kar leti hoon ki aap reschedule karna chahte hain — {window}. Main khud naya slot book nahi kar sakti; clinic ki team aapko call karke naya slot confirm karegi." if hi
                           else f"Okay, I've noted that you'd like to reschedule — {window}. I can't book a new slot myself; the clinic team will call you to offer one."))
        elif outcome == "declined":
            turns.append(p("Hum nahi aa payenge, please cancel kar dijiye." if hi else "I won't be coming, please cancel it."))
            turns.append(a("Theek hai, maine note kar liya hai. Clinic ki team aapse follow up karegi." if hi
                           else "Understood, I've noted that. The clinic team will follow up with you."))
        else:
            turns.append(p("Haan ji, aa jayenge." if hi else "Yes, I'll be there."))
            turns.append(a("Dhanyavaad, maine aapka confirmation note kar liya hai." if hi else "Thank you, I've noted your confirmation."))
    elif tt == "test_report_reminder":
        test = (task.get("test_tracking") or {}).get("test_name", "test")
        turns.append(a(f"Doctor ne aapko {test} test karwane ko kaha tha. Kya aapka test ho gaya?" if hi
                       else f"Your doctor asked you to get a {test} test done. Have you been able to do it?"))
        if ex.get("test_completed") is True:
            when = ex.get("test_date") or "recently"
            turns.append(p(f"Haan, {when.lower()} karwa liya." if hi else f"Yes, I did it {when.lower()}."))
            turns.append(a("Dhanyavaad, maine note kar liya hai. Clinic ki team report check karegi." if hi
                           else "Thank you, I've noted that. The clinic team will check for the report."))
        else:
            turns.append(p("Abhi nahi hua." if hi else "Not yet."))
            turns.append(a("Koi baat nahi, hum aapko do din mein phir yaad dilayenge." if hi
                           else "No problem, we'll remind you again in two days."))
    elif tt == "post_procedure_checkin":
        turns.append(a(f"{first} ji, yeh aapke procedure ke baad ka routine check-in hai. Aap kaisa mehsoos kar rahe hain?" if hi
                       else f"{first}, this is a routine check-in after your procedure. How are you feeling?"))
        if ex.get("checkin_result") == "concern_reported":
            turns.append(p(ex.get("concern_summary") or "Thodi takleef hai."))
            turns.append(a("Bataane ke liye dhanyavaad. Main yeh baat abhi nurse desk tak pahuncha rahi hoon, woh aapko jaldi call karenge. Agar takleef bahut badh jaaye, toh turant clinic ya emergency se sampark karein." if hi
                           else "Thank you for telling me. I'm passing this to the nurse desk now and they will call you soon. If it gets much worse, please contact the clinic or emergency services right away."))
        else:
            turns.append(p("Main theek hoon, koi problem nahi." if hi else "I'm doing fine, no problems."))
            turns.append(a("Yeh sunkar achha laga. Dhyan rakhiye." if hi else "Glad to hear that. Take care."))
    elif tt == "clinician_task_reminder":
        turns.append(a(f"{task['purpose']} Kya aap yeh kar payenge?" if hi else f"{task['purpose']} Will you be able to do this?"))
        note = ex.get("patient_note")
        turns.append(p((f"Haan ji. {note}." if note else "Haan ji, kar denge.") if hi else (f"Yes. {note}." if note else "Yes, I will.")))
        turns.append(a("Dhanyavaad, maine note kar liya hai." if hi else "Thank you, I've noted that."))
    else:
        turns.append(a("Aapne clinic se callback ke liye kaha tha. Main aapki kaise madad kar sakti hoon?" if hi
                       else "You asked the clinic to call you back. How can I help?"))
        turns.append(p("Bas confirm karna tha, ab theek hai." if hi else "I just wanted to confirm something — all sorted now."))
        turns.append(a("Theek hai, dhanyavaad." if hi else "Okay, thank you."))

    if ex.get("callback_requested"):
        window = ex.get("callback_window") or "later"
        turns.append(p(f"Kya aap mujhe {window} call kar sakte hain?" if hi else f"Could someone call me back {window}?"))
        turns.append(a("Ji, maine callback request note kar li hai." if hi else "Sure, I've noted your callback request."))
    return turns
