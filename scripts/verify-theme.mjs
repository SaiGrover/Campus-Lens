import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.CAMPUSLENS_URL ?? "http://localhost:3011";
const output = resolve(".next/theme-audit");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let networkAudit;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function inspect(name, path, viewport, action) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  if (action) await action(page);
  await page.waitForTimeout(1_600);
  const state = await page.evaluate(() => ({
    content: document.body.innerText.trim().length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overlay: Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")),
    images: [...document.images].map((image) => ({ alt: image.alt, complete: image.complete, width: image.naturalWidth })),
  }));
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  results.push({ name, errors, ...state });
  await page.close();
  console.log(`verified ${name}`);
}

try {
  await inspect("landing-desktop", "/", { width: 1440, height: 900 });
  await inspect("dashboard-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: /Last 30 days/ }).click();
    await page.getByRole("button", { name: /Last 90 days/ }).waitFor();
    await page.getByRole("button", { name: "Notifications" }).click();
    await page.getByText(/critical records/).waitFor();
  });
  await inspect("explore-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Issue explorer" }).click();
  });
  await inspect("models-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Model lab" }).click();
  });
  await inspect("rules-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Pattern rules" }).click();
    await page.getByRole("button", { name: /min lift 2.0/ }).click();
    await page.getByRole("button", { name: /min lift 3.0/ }).waitFor();
  });
  await inspect("methodology-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Data methodology" }).click();
  });
  await inspect("report-modal-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Report an issue" }).click();
    await page.getByLabel("Issue title").fill("Wi-Fi");
    await page.getByLabel("Complaint").fill("short");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByText("Add a clear title and at least 12 characters of detail.").waitFor();
  });
  await inspect("problem-desktop", "/problem-statement", { width: 1440, height: 900 });
  await inspect("landing-mobile", "/", { width: 390, height: 844 });
  await inspect("dashboard-mobile", "/", { width: 390, height: 844 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Issue explorer" }).waitFor();
  });
  await inspect("problem-mobile", "/problem-statement", { width: 390, height: 844 });
  const auditPage = await browser.newPage();
  await auditPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  networkAudit = await auditPage.evaluate(async () => {
    const paths = ["/images/brand/campus-night-map.webp", "/images/brand/campus-friction-collage.webp", "/data/campuslens-complaints.arff"];
    const assets = await Promise.all(paths.map(async (path) => ({ path, status: (await fetch(path)).status })));
    const complaintResponse = await fetch("/api/complaints");
    return { assets, complaintStatus: complaintResponse.status, complaintPayload: await complaintResponse.json() };
  });
  await auditPage.close();
} finally {
  await browser.close();
}

for (const asset of networkAudit.assets) assert(asset.status === 200, `Asset failed to load: ${asset.path} (${asset.status})`);
assert(networkAudit.complaintStatus === 200, `Complaint API failed (${networkAudit.complaintStatus})`);
assert(Array.isArray(networkAudit.complaintPayload.complaints), "Complaint API returned an invalid payload");
assert(["postgres", "browser"].includes(networkAudit.complaintPayload.persistence), "Complaint API returned an invalid persistence mode");

const failed = results.some((result) => result.errors.length || !result.content || result.overflow || result.overlay || result.images.some((image) => !image.complete || image.width === 0));
console.log(JSON.stringify({ ok: !failed, output, results }, null, 2));
if (failed) process.exitCode = 1;
