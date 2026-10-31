# Hackathon submission — link & sign-in for judges

**Live app:** https://project-bf77a013-c0b3-413c-a75.web.app

## How reviewers sign in (no Google needed)

1. Open the link above.
2. On **Staff sign-in**, use the yellow **Hackathon & demo reviewers** box (access key is shown on the page).
3. Click **Fill access key for me**, then **Continue to dashboard**.
4. If **Today** looks empty, click **Load demo data** (or open **Settings → Demo data for reviewers**). Sample patients, call transcripts, and escalations appear instantly — no live call needed.
5. Use the header toggle **Front desk** vs **Doctor** to see both workflows.

You can paste this block into your submission form:

```text
Demo URL: https://project-bf77a013-c0b3-413c-a75.web.app
Sign-in: Open the URL → copy the demo access key from the yellow box on the sign-in screen → Continue to dashboard. Google sign-in is optional.
Try: Front desk — register a patient, book appointment, Tasks → Start Jiya call. Doctor — Clinical inbox and resolve an escalation.
```

## After the hackathon (real clinic)

Set `CLINIC_PUBLISH_REVIEWER_KEY=false` (or remove it), rotate `CLINIC_API_KEY` to a private staff-only key, and stop showing the key on the public page. See [CLINIC_DAY_ONE.md](./CLINIC_DAY_ONE.md).
