import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.CAMPUSLENS_URL ?? "http://localhost:3011";
const output = resolve(".next/theme-audit");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];

async function inspect(name, path, viewport, action) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
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
}

try {
  await inspect("landing-desktop", "/", { width: 1440, height: 900 });
  await inspect("dashboard-desktop", "/", { width: 1440, height: 900 }, (page) => page.getByRole("button", { name: "Open CampusLens dashboard" }).click());
  await inspect("models-desktop", "/", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "Open CampusLens dashboard" }).click();
    await page.getByRole("button", { name: "Model lab" }).click();
  });
  await inspect("problem-desktop", "/problem-statement", { width: 1440, height: 900 });
  await inspect("landing-mobile", "/", { width: 390, height: 844 });
  await inspect("problem-mobile", "/problem-statement", { width: 390, height: 844 });
} finally {
  await browser.close();
}

const failed = results.some((result) => result.errors.length || !result.content || result.overflow || result.overlay || result.images.some((image) => !image.complete || image.width === 0));
console.log(JSON.stringify({ ok: !failed, output, results }, null, 2));
if (failed) process.exitCode = 1;
