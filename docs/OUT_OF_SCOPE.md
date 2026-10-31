# Out of scope (documented, not in this repo)

Items from the original product vision that **require external products, contracts, or major new services** — not implemented here.

| Area | Why |
|------|-----|
| **EHR / FHIR sync** | Needs SMART-on-FHIR app, clinic EMR credentials, and mapping to `Appointment` / `Patient` |
| **Inbound Jiya line** | Bolna inbound number + agent routing; separate from outbound clinic flows |
| **SMS / email notifications** | Twilio/SendGrid/FCM templates and consent flows |
| **Multi-clinic tenancy** | Org model, billing, data isolation beyond single `CLINIC_NAME` |
| **Custom LLM “brain” on Bolna** | Hosted OpenAI-compatible endpoint + tool routing |
| **HIPAA BAA package** | Legal/process; app provides audit events in Mongo only |
| **Atlas IP lockdown** | Operational step: replace `0.0.0.0/0` with VPC peering when ready |

Implemented alternatives: manual appointments, CSV export, staff call override, Firebase Google sign-in (optional), hackathon dial override env.
