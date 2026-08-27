/** Screenshot helper for the profession-fit demo (demo only). Drives Playwright directly
 * (gstack browse CLI would not pair on this box — known issue). Run with:
 *   node reports/qa_scripts/fit_screenshots.mjs
 */
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright/index.js");
const { chromium } = require("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright");
import { SignJWT } from "file:///C:/Users/Forre/consent/node_modules/jose/dist/webapi/index.js";

const BASE = "http://localhost:3116";
const OUT = "C:/Users/Forre/consent/reports/qa_scripts/";
const SECRET = new TextEncoder().encode("aegis-audit-secret-2026");

async function mint(openId, name) {
  return new SignJWT({ openId, appId: "local-audit", name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
}

const browser = await chromium.launch({ executablePath: "C:/Users/Forre/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });

async function shootAs(openId, name, pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const jwt = await mint(openId, name);
  await ctx.addCookies([{ name: "app_session_id", value: jwt, url: BASE }]);
  const page = await ctx.newPage();
  for (const [path, file] of pages) {
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: OUT + file, fullPage: true });
      console.log("SHOT", file);
    } catch (e) { console.log("FAILED", file, e.message?.slice(0, 120)); }
  }
  await ctx.close();
}

// Marta (dentist) — clinic 1: record 1 signed implant consent, treatment map, patient history
await shootAs("synth-marta", "Dr SYNTH-Marta", [
  ["/", "fit_marta_home.png"],
  ["/create", "fit_marta_create_consent.png"],
  ["/treatment-map/1", "fit_marta_treatment_map_tooth36.png"],
  ["/review/1", "fit_marta_review_signed.png"],
  ["/patients/1", "fit_marta_patient_history.png"],
  ["/records", "fit_marta_records.png"],
]);
// Amira (aesthetic) — clinic 3, record 10 withdrawn botox consent
await shootAs("synth-amira", "Dr SYNTH-Amira", [
  ["/review/10", "fit_amira_review_withdrawn.png"],
  ["/treatment-map/10", "fit_amira_facial_map.png"],
]);
// Anonymous patient page (link already used — expect used/invalid state)
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
try {
  await p.goto(BASE + "/patient-sign/grcDuAkMTTKwG6DNzvFyRBkgQ5BtDohS0AQ6Gz763zg", { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + "fit_patient_sign_used_link.png", fullPage: true });
  console.log("SHOT fit_patient_sign_used_link.png");
} catch (e) { console.log("FAILED patient page", e.message?.slice(0, 120)); }
await ctx.close();
await browser.close();
console.log("SCREENSHOTS DONE");
