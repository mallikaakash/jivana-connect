#!/usr/bin/env node
/**
 * Records a demo walkthrough with optional LIVE Jiya calls.
 *
 * Playwright controls the browser; you answer the phone when prompted.
 * Screen video has no phone audio — add voice-over or phone recording in edit.
 *
 * Usage:
 *   npm run demo:video:setup   # once: playwright chromium
 *   DEMO_PHONE_E164=+91XXXXXXXXXX DEMO_INTERACTIVE=1 npm run demo:video:live
 *
 * Env:
 *   DEMO_PHONE_E164     — patient mobile (must match Bolna verified number)
 *   DEMO_PHONE_LOCAL    — local digits if E164 omitted (default country +91)
 *   DEMO_INTERACTIVE=1  — pause stdin before/after each live call
 *   DEMO_SKIP_CALLS=1   — UI only, no Start Jiya call clicks
 *   DEMO_HEADED=1       — show browser window
 *   DEMO_VIDEO_BASE_URL / DEMO_VIDEO_API_BASE — same as record-app-demo.mjs
 */
import { chromium } from 'playwright'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.DEMO_VIDEO_BASE_URL ?? 'https://project-bf77a013-c0b3-413c-a75.web.app'
const API = (process.env.DEMO_VIDEO_API_BASE ?? 'https://jivana-clinic-api-2lcs3sivbq-el.a.run.app/api').replace(
  /\/$/,
  '',
)
const OUT_DIR = join(process.cwd(), 'docs/demo-videos')
const OUT_FILE = join(OUT_DIR, 'jivana-connect-demo-with-calls.mp4')
const VIEWPORT = { width: 1280, height: 720 }
const INTERACTIVE = process.env.DEMO_INTERACTIVE === '1'
const SKIP_CALLS = process.env.DEMO_SKIP_CALLS === '1'
const HEADED = process.env.DEMO_HEADED === '1'

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

function tomorrowAt16IstIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(16, 0, 0, 0)
  return d.toISOString()
}

function dueNowIso() {
  return new Date(Date.now() - 60_000).toISOString()
}

function resolvePhoneE164() {
  const raw = process.env.DEMO_PHONE_E164?.trim()
  if (raw) return raw.startsWith('+') ? raw : `+${raw}`
  const local = (process.env.DEMO_PHONE_LOCAL ?? '8812861947').replace(/\D/g, '')
  return `+91${local}`
}

async function api(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : data}`)
  }
  return data
}

async function waitForTaskSettled(token, taskId, { timeoutMs = 420_000 } = {}) {
  const start = Date.now()
  let lastStatus = ''
  while (Date.now() - start < timeoutMs) {
    const detail = await api(token, `/tasks/${taskId}`)
    const task = detail.task ?? detail
    const status = task.status
    if (status !== lastStatus) {
      console.log(`[demo-video] task ${taskId} status: ${status}`)
      lastStatus = status
    }
    if (['awaiting_staff_action', 'completed', 'failed'].includes(status)) {
      return task
    }
    await pause(3000)
  }
  throw new Error(`Timed out waiting for task ${taskId}`)
}

async function promptUser(message) {
  if (!INTERACTIVE) {
    console.log(`[demo-video] (non-interactive) ${message} — waiting 90s`)
    await pause(90_000)
    return
  }
  const rl = createInterface({ input, output })
  console.log('\n📞 PHONE:', message)
  await rl.question('Press Enter when the call is finished (or skip if no ring)… ')
  rl.close()
}

async function clickIfVisible(page, locator, ms = 2500) {
  const el = page.locator(locator).first()
  if (await el.isVisible({ timeout: ms }).catch(() => false)) {
    await el.click()
    return true
  }
  return false
}

async function startJiyaCall(page) {
  const btn = page.getByRole('button', { name: /Start Jiya call/i })
  await btn.waitFor({ state: 'visible', timeout: 20_000 })
  await btn.click()
  await pause(600)
  await clickIfVisible(page, 'button:has-text("Start call")', 5000)
}

async function seedAjay(token, phoneE164) {
  const patient = await api(token, '/patients', {
    method: 'POST',
    body: {
      display_name: 'Ajay Mehta',
      phone_e164: phoneE164,
      language: 'hinglish',
      contact_permitted: true,
      age: 32,
      gender: 'male',
    },
  })
  const patientId = patient.patient?.patient_id ?? patient.patient_id
  if (!patientId) throw new Error('create patient: missing patient_id in response')
  const apptAt = tomorrowAt16IstIso()
  const due = dueNowIso()

  const confirm = await api(token, '/tasks', {
    method: 'POST',
    body: {
      patient_id: patientId,
      task_type: 'appointment_confirmation',
      title: 'Confirm appointment — root canal follow-up',
      purpose: 'Confirm Ajay can attend his dental visit tomorrow at 4 PM.',
      call_context:
        'Dental appointment confirmation. Patient is mid root canal treatment. Confirm attendance; if not, record reschedule request. No clinical advice.',
      due_at: due,
      department: 'Dental',
      priority: 'normal',
      appointment_scheduled_at: apptAt,
      appointment_clinician: 'Dr. Sharma',
    },
  })

  const checkin = await api(token, '/tasks', {
    method: 'POST',
    body: {
      patient_id: patientId,
      task_type: 'post_procedure_checkin',
      title: 'After root canal visit — how’s the tooth?',
      purpose: 'Check how Ajay is feeling after yesterday’s dental visit.',
      call_context:
        'Post-visit follow-up after root canal session. Ask about pain, chewing, swelling. Record concerns for care team — no medical advice.',
      due_at: due,
      department: 'Dental',
      priority: 'normal',
    },
  })

  return {
    patientId,
    confirmTaskId: confirm.task?.task_id ?? confirm.task_id,
    checkinTaskId: checkin.task?.task_id ?? checkin.task_id,
    apptAt,
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const phone = resolvePhoneE164()
  console.log(`[demo-video] Patient phone (Ajay): ${phone}`)
  if (!SKIP_CALLS && !INTERACTIVE) {
    console.log('[demo-video] Tip: set DEMO_INTERACTIVE=1 so the script waits while you answer calls.')
  }

  const meta = await fetch(`${API}/meta`).then((r) => r.json())
  const token = meta.reviewer_sign_in?.access_key?.trim()
  if (!token) throw new Error('No reviewer access_key in /meta — cannot auth API or app.')

  const step = (msg) => console.log(`[demo-video] ${msg}`)
  step('Seeding Ajay + tasks via API')
  const { patientId, confirmTaskId, checkinTaskId } = await seedAjay(token, phone)

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  try {
    step('Landing (short)')
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await pause(1500)
    await page.evaluate((key) => sessionStorage.setItem('jivana_clinic_token', key), token)
    await page.goto(`${BASE.replace(/\/$/, '')}/today`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await pause(1500)

    step('Patients → Ajay')
    await page.goto(`${BASE}/patients/${patientId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/patients\//, { timeout: 15_000 })
    await pause(2000)
    await page.mouse.wheel(0, 300)
    await pause(1200)

    step('Appointments')
    await page.goto(`${BASE}/appointments`, { waitUntil: 'domcontentloaded' })
    await pause(2200)

    step('Confirmation task')
    await page.goto(`${BASE}/tasks/${confirmTaskId}`, { waitUntil: 'domcontentloaded' })
    await pause(2500)
    await page.mouse.wheel(0, 280)
    await pause(1000)

    if (!SKIP_CALLS) {
      await promptUser(
        `Call 1 — CONFIRM / RESCHEDULE. Keep this tab visible. When ready, the script will click Start Jiya call. Answer as Ajay and ask to RESCHEDULE tomorrow 4 PM.`,
      )
      step('Starting Jiya call 1')
      await startJiyaCall(page)
      await promptUser('Call 1 in progress — answer the phone, say you need to reschedule, then hang up.')
      step('Waiting for task 1 to update…')
      await waitForTaskSettled(token, confirmTaskId).catch((e) => {
        console.warn('[demo-video]', e.message)
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await pause(2500)
    }

    step('Calls list')
    await page.goto(`${BASE}/calls`, { waitUntil: 'domcontentloaded' })
    await pause(1800)
    const callLink = page.locator('a[href*="/calls/"]').first()
    if (await callLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await callLink.click()
      await pause(3000)
      await page.mouse.wheel(0, 400)
      await pause(1500)
    }

    step('Tasks inbox')
    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' })
    await pause(1800)

    step('Post-procedure task')
    await page.goto(`${BASE}/tasks/${checkinTaskId}`, { waitUntil: 'domcontentloaded' })
    await pause(2500)

    if (!SKIP_CALLS) {
      await promptUser(
        `Call 2 — CHECK-IN. Click will start Jiya. Answer as Ajay: "still a bit sore when I chew."`,
      )
      step('Starting Jiya call 2')
      await startJiyaCall(page)
      await promptUser('Call 2 in progress — answer and describe mild soreness when chewing.')
      await waitForTaskSettled(token, checkinTaskId).catch((e) => {
        console.warn('[demo-video]', e.message)
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await pause(2500)
    }

    step('Clinical review')
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await pause(800)
    await clickIfVisible(page, 'button:has-text("Doctor")', 4000)
    await pause(1200)
    await page.goto(`${BASE}/escalations`, { waitUntil: 'domcontentloaded' })
    await pause(2200)
    const escRow = page.locator('table tbody tr').first()
    if (await escRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await escRow.click()
      await pause(2500)
    }

    step('Today (front desk)')
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await pause(800)
    await clickIfVisible(page, 'button:has-text("Front desk")', 4000)
    await pause(2000)
    await page.mouse.wheel(0, 450)
    await pause(1500)
  } catch (err) {
    console.error('[demo-video] Error during recording:', err.message)
    throw err
  } finally {
    const video = page.video()
    await page.close()
    await context.close()
    await browser.close()

    if (video) {
      const rawPath = await video.path()
      try {
        await unlink(OUT_FILE)
      } catch {
        /* ignore */
      }
      await rename(rawPath, OUT_FILE)
      console.log(`\nDemo video saved: ${OUT_FILE}`)
      console.log('Note: phone audio is not in this file — add VO or merge phone recording in edit.\n')
    } else {
      console.error('No video recorded.')
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
