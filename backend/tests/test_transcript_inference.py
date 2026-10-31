from app.transcript_inference import (
    infer_appointment_from_transcript,
    infer_callback_from_transcript,
    infer_post_procedure_from_transcript,
    infer_test_report_from_transcript,
)


def test_infer_reschedule_from_transcript():
    transcript = [
        {"role": "agent", "text": "Can you make it on 1 Nov?"},
        {"role": "patient", "text": "no i won't be able to make it"},
        {"role": "agent", "text": "Would you like to reschedule?"},
        {"role": "patient", "text": "yes reschedule for fifth november"},
        {"role": "agent", "text": "Noted for 5th November. Team will call you."},
    ]
    ex = infer_appointment_from_transcript(transcript)
    assert ex["appointment_outcome"] == "rescheduling_requested"
    assert "november" in ex["preferred_reschedule_window"].lower()


def test_infer_tenth_of_november_and_wont_be_to_make():
    transcript = [
        {"role": "patient", "text": "no sorry i won't be to make it actually"},
        {"role": "patient", "text": "could we reschedule it for tenth of november"},
        {"role": "agent", "text": "Noted your preference for the 10th of November."},
    ]
    ex = infer_appointment_from_transcript(transcript)
    assert ex["appointment_outcome"] == "rescheduling_requested"
    assert "november" in ex["preferred_reschedule_window"].lower()


def test_infer_post_procedure_concern():
    transcript = [
        {"role": "agent", "text": "How are you after your visit?"},
        {"role": "patient", "text": "still have pain and swelling"},
    ]
    ex = infer_post_procedure_from_transcript(transcript)
    assert ex["checkin_result"] == "concern_reported"


def test_infer_callback_schedule_third_of_november():
    transcript = [
        {"role": "patient", "text": "i would like to schedule"},
        {"role": "patient", "text": "appointment for third of november"},
    ]
    ex = infer_callback_from_transcript(transcript)
    assert ex["callback_requested"] is True
    assert "november" in ex["callback_window"].lower()


def test_infer_test_completed():
    transcript = [
        {"role": "agent", "text": "Did you get the blood test done?"},
        {"role": "patient", "text": "yes i completed the test yesterday"},
    ]
    ex = infer_test_report_from_transcript(transcript)
    assert ex["test_completed"] is True
