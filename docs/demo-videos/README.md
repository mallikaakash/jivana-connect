# Jivana Connect demo videos

## Product walkthrough (auto-recorded)

Silent screen recording of the **live** app: landing → workspace → Today, clinical review, tasks, calls, patients, and product section.

**Generate:**

```bash
npm install playwright --no-save
npx playwright install chromium
node scripts/record-app-demo.mjs
```

**Output:** `docs/demo-videos/jivana-connect-product-demo.mp4` (~40s silent walkthrough of production)

**Includes:** Landing → Today (demo data if empty) → Clinical review → Task detail → Call detail → Patient profile → Landing product section.

Optional: `DEMO_VIDEO_BASE_URL=http://localhost:5173 node scripts/record-app-demo.mjs`

Add voice-over using `docs/DEMO_VIDEO_5MIN_SCRIPT.md` in iMovie, CapCut, or DaVinci Resolve.

## Demo with live Jiya calls (Playwright + your phone)

Playwright drives the browser and clicks **Start Jiya call**; **you** answer as Ajay on your mobile.

```bash
npm run demo:video:setup
export DEMO_PHONE_E164="+91XXXXXXXXXX"   # Bolna-verified number
export DEMO_INTERACTIVE=1
npm run demo:video:live
```

- Output: `docs/demo-videos/jivana-connect-demo-with-calls.mp4`
- The script seeds **Ajay Mehta** via API, then records: patient → appointments → 2 live calls → calls/transcript → clinical review → Today.
- **Phone audio is not captured** in the screen recording — add `docs/DEMO_VIDEO_5MIN_SCRIPT.md` voice-over in edit, or record the phone on another device.
- `DEMO_SKIP_CALLS=1` — same flow without placing calls (UI only).
- `DEMO_HEADED=1` — visible browser.

## Launch film (Remotion)

Marketing-style ~2 min film (not a live UI capture):

```bash
cd film && npm install && npm run render:preview
```

Output: `film/out/preview.mp4`
