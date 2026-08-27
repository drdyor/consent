/** Screenshot helper for the 2026-08-28 signing-UX build (audit evidence only).
 * Drives Playwright directly (gstack browse CLI would not pair on this box — known issue).
 * Prereqs: signing_ux_smoke.ts server stack on :3132 (SMOKE_BASE), a `sent` consent record,
 * and a fresh signing-link token. Run:
 *   node reports/qa_scripts/signing_ux_screenshots.mjs <reviewRecordId> <patientSignToken>
 */
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright/index.js");
const { chromium } = require("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright");
import { SignJWT } from "file:///C:/Users/Forre/consent-signing/node_modules/jose/dist/webapi/index.js";

const BASE = process.env.SMOKE_BASE || "http://localhost:3132";
const OUT = "C:/Users/Forre/consent-signing/reports/qa_scripts/";
const SECRET = new TextEncoder().encode("aegis-signing-secret-2026");
const [recordId, token] = process.argv.slice(2);
if (!recordId || !token) { console.error("usage: node signing_ux_screenshots.mjs <reviewRecordId> <patientSignToken>"); process.exit(1); }

const jwt = await new SignJWT({ openId: "signing-ux-doc", appId: "local-signing", name: "SYNTH-Dr Amira" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
const browser = await chromium.launch({ executablePath: "C:/Users/Forre/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });

// 1. Practitioner review page of a `sent` consent — signing-link card + create link + QR
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "app_session_id", value: jwt, url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/review/${recordId}`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "signing_ux_review_link_card.png", fullPage: true });
console.log("SHOT signing_ux_review_link_card.png");
try {
  await page.getByRole("button", { name: /Create signing link|Utwórz link/ }).click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "signing_ux_review_link_created_qr.png", fullPage: true });
  console.log("SHOT signing_ux_review_link_created_qr.png");
} catch (e) { console.log("FAILED create-link click", e.message?.slice(0, 120)); }
await ctx.close();

// 2. Patient page — drawn signature via signature_pad, reject affordance visible
const anon = await browser.newContext({ viewport: { width: 800, height: 1200 } });
const p2 = await anon.newPage();
await p2.goto(`${BASE}/patient-sign/${token}`, { waitUntil: "networkidle", timeout: 30000 });
await p2.waitForTimeout(1200);
await p2.screenshot({ path: OUT + "signing_ux_patient_sign_typed.png", fullPage: true });
console.log("SHOT signing_ux_patient_sign_typed.png");
try {
  await p2.getByRole("button", { name: "Draw signature" }).click({ timeout: 5000 });
  await p2.waitForTimeout(600);
  const canvas = p2.getByTestId("signature-pad-canvas");
  const box = await canvas.boundingBox();
  await p2.mouse.move(box.x + 40, box.y + 80);
  await p2.mouse.down();
  await p2.mouse.move(box.x + 120, box.y + 40, { steps: 12 });
  await p2.mouse.move(box.x + 220, box.y + 100, { steps: 12 });
  await p2.mouse.up();
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: OUT + "signing_ux_patient_sign_drawn.png", fullPage: true });
  console.log("SHOT signing_ux_patient_sign_drawn.png");
} catch (e) { console.log("FAILED drawn interaction", e.message?.slice(0, 120)); }
await anon.close();
await browser.close();
