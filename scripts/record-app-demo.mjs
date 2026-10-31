#!/usr/bin/env node
/**
 * Records a silent product walkthrough of the deployed Jivana Connect app.
 * Output: docs/demo-videos/jivana-connect-product-demo.mp4
 *
 * Requires: npx playwright install chromium (run once)
 */
import { chromium } from 'playwright'
import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.DEMO_VIDEO_BASE_URL ?? 'https://project-bf77a013-c0b3-413c-a75.web.app'
const API =
  process.env.DEMO_VIDEO_API_BASE ?? 'https://jivana-clinic-api-2lcs3sivbq-el.a.run.app/api'
const OUT_DIR = join(process.cwd(), 'docs/demo-videos')
const OUT_FILE = join(OUT_DIR, 'jivana-connect-product-demo.mp4')
const VIEWPORT = { width: 1280, height: 720 }

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickIfVisible(page, locator, ms = 2500) {
  const el = page.locator(locator).first()
  if (await el.isVisible({ timeout: ms }).catch(() => false)) {
    await el.click()
    return true
  }
  return false
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  const step = (msg) => console.log(`[demo-video] ${msg}`)

  try {
    // —— Landing ——
    step('Landing')
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('h1', { timeout: 30_000 })
    await pause(2200)
    await page.mouse.wheel(0, 280)
    await pause(1200)
    await page.mouse.wheel(0, -280)
    await pause(800)

    step('Open workspace')
    const meta = await fetch(`${API.replace(/\/$/, '')}/meta`).then((r) => r.json())
    const accessKey = meta.reviewer_sign_in?.access_key?.trim()
    if (accessKey) {
      await page.evaluate((key) => sessionStorage.setItem('jivana_clinic_token', key), accessKey)
    }
    await page.goto(`${BASE.replace(/\/$/, '')}/today`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await pause(2000)

    // —— Today / demo seed ——
    if (await clickIfVisible(page, 'button:has-text("Load demo data")')) {
      await pause(3500)
    }

    await pause(2000)
    await page.mouse.wheel(0, 400)
    await pause(1500)

    // —— Clinical review ——
    step('Clinical review')
    await page.goto(`${BASE}/escalations`, { waitUntil: 'domcontentloaded' })
    await pause(2000)
    const escRow = page.locator('table tbody tr, [role="row"]').nth(1)
    if (await escRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await escRow.click()
      await pause(2500)
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await pause(1000)
    }

    // —— Tasks ——
    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' })
    await pause(2000)
    const taskLink = page.locator('a[href*="/tasks/"]').first()
    if (await taskLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await taskLink.click()
      await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
      await pause(2800)
      await page.mouse.wheel(0, 350)
      await pause(1200)
    }

    // —— Calls ——
    await page.goto(`${BASE}/calls`, { waitUntil: 'domcontentloaded' })
    await pause(1800)
    const callLink = page.locator('a[href*="/calls/"]').first()
    if (await callLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await callLink.click()
      await page.waitForURL(/\/calls\//, { timeout: 15_000 })
      await pause(2800)
    }

    // —— Patients ——
    await page.goto(`${BASE}/patients`, { waitUntil: 'domcontentloaded' })
    await pause(1800)
    const patientLink = page.locator('a[href*="/patients/"]').first()
    if (await patientLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await patientLink.click()
      await page.waitForURL(/\/patients\//, { timeout: 15_000 })
      await pause(2500)
    }

    // —— Doctor role (if toggle exists) ——
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await pause(1200)
    await clickIfVisible(page, 'button:has-text("Doctor")')
    await pause(2000)
    await clickIfVisible(page, 'button:has-text("Front desk")')
    await pause(1200)

    // —— Landing product section ——
    await page.goto(`${BASE}/#product`, { waitUntil: 'domcontentloaded' })
    await pause(2500)
    await page.mouse.wheel(0, 600)
    await pause(2000)
    await page.mouse.wheel(0, 500)
    await pause(1800)

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await pause(2000)
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
      console.log(`\nDemo video saved: ${OUT_FILE}\n`)
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
