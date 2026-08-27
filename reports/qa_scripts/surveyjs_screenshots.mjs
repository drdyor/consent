/** SurveyJS-renderer screenshots (light + dark emulation) against the live smoke server
 * on port 3118 (throwaway aegis-surveyjs-mysql DB). Demo/QA only — not part of the product.
 * Creates a fresh consent from the opt-in surveyjs template, issues a patient signing
 * link, and screenshots the patient-sign page rendered by survey-react-ui.
 * Run: node reports/qa_scripts/surveyjs_screenshots.mjs
 */
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright/index.js");
const { chromium } = require("C:/Users/Forre/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright");
import { SignJWT } from "file:///C:/Users/Forre/consent-surveyjs/node_modules/jose/dist/webapi/index.js";

const BASE = "http://localhost:3118";
const OUT = "C:/Users/Forre/consent-surveyjs/reports/qa_scripts/";
const SECRET = new TextEncoder().encode("aegis-oss-secret-2026");

const jwt = await new SignJWT({ openId: "smoke-eva", appId: "local-oss", name: "SYNTH-Eva Admin" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);

async function trpc(path, input, type = "mutation") {
  const url = `${BASE}/api/trpc/${path}${type === "query" ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ""}`;
  const res = await fetch(url, {
    method: type === "query" ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie: `app_session_id=${jwt}` },
    body: type === "query" ? undefined : JSON.stringify({ json: input }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${path}: ${JSON.stringify(body.error).slice(0, 300)}`);
  return body.result?.data?.json;
}

// Find the opt-in surveyjs template created by the smoke, make a fresh consent, send, link.
const templates = await trpc("catalog.templates", undefined, "query");
const surveyTemplate = templates.filter(t => t.renderEngine === "surveyjs").at(-1);
if (!surveyTemplate) throw new Error("no surveyjs template in throwaway DB — run surveyjs_smoke.ts first");
const created = await trpc("consent.create", { templateId: surveyTemplate.id, treatmentAreaKey: "tooth-36", procedureName: "SurveyJS screenshot procedure", patientFirstName: "Pawlu", patientLastName: "SYNTH-Screenshot", jurisdiction: "PL", language: "en" });
await trpc("consent.send", { recordId: created.id });
const link = await trpc("consent.createPatientSigningLink", { recordId: created.id });
console.log("signing path:", link.path);

const browser = await chromium.launch({ executablePath: "C:/Users/Forre/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(BASE + link.path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500); // lazy chunk load
  await page.screenshot({ path: `${OUT}surveyjs_patient_sign_${scheme}.png`, fullPage: true });
  console.log("SHOT", `surveyjs_patient_sign_${scheme}.png`);
  if (scheme === "light") {
    // tick the first section acknowledgement to reveal the conditional panel, reshoot
    const first = page.locator(".aegis-survey .sd-selectbase__label").first();
    if (await first.count()) { await first.click(); await page.waitForTimeout(600);await page.screenshot({ path: `${OUT}surveyjs_patient_sign_conditional_revealed.png`, fullPage: true }); console.log("SHOT surveyjs_patient_sign_conditional_revealed.png"); }
  }
  await ctx.close();
}
await browser.close();
console.log("SCREENSHOTS DONE");
