import { chromium } from "playwright";

const baseURL = process.env.CAMPUSLENS_URL ?? "http://localhost:3010";
const marker = `Neon persistence verification ${Date.now()}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const consoleErrors = [];

try {
  const submitContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const submitPage = await submitContext.newPage();
  submitPage.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  await submitPage.goto(baseURL, { waitUntil: "networkidle" });
  await submitPage.getByRole("button", { name: /report friction/i }).first().click();
  await submitPage.getByLabel("Issue title").fill("Database persistence verification");
  await submitPage.getByLabel("Complaint").fill(`${marker}. Wi-Fi repeatedly disconnects in CL3 during lectures.`);
  await submitPage.getByRole("button", { name: /continue/i }).click();
  await submitPage.getByLabel("Floor / room").fill("Floor 2 / CL3");
  await submitPage.getByLabel("Category").selectOption({ label: "Network" });

  const postResponsePromise = submitPage.waitForResponse((response) => response.url().endsWith("/api/complaints") && response.request().method() === "POST");
  await submitPage.getByRole("button", { name: /submit anonymously/i }).click();
  const postResponse = await postResponsePromise;
  const postBody = await postResponse.json();
  if (postResponse.status() !== 201 || postBody.persistence !== "postgres") {
    throw new Error(`Submission did not use PostgreSQL: ${postResponse.status()} ${JSON.stringify(postBody)}`);
  }
  const submittedId = postBody.complaint.id;
  await submitContext.close();

  // A brand-new context has no cookies or localStorage from the submission page.
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const freshPage = await freshContext.newPage();
  freshPage.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  const getResponse = await freshContext.request.get(`${baseURL}/api/complaints`);
  const getBody = await getResponse.json();
  const persisted = getBody.persistence === "postgres" && getBody.complaints.some((complaint) => complaint.id === submittedId);
  if (!persisted) throw new Error(`Fresh browser context could not retrieve ${submittedId} from PostgreSQL.`);

  await freshPage.goto(baseURL, { waitUntil: "networkidle" });
  await freshPage.getByRole("button", { name: "Open CampusLens dashboard" }).click();
  await freshPage.getByRole("button", { name: "Open navigation" }).waitFor();
  const overflow = await freshPage.evaluate(() => ({
    detected: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 6)
      .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right) })),
  }));
  if (overflow.detected) throw new Error(`Mobile dashboard overflow: ${JSON.stringify(overflow)}`);
  await freshContext.close();

  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, persistence: "postgres", submittedId, freshContextRetrieved: true, mobileOverflow: overflow.detected }));
} finally {
  await browser.close();
}
