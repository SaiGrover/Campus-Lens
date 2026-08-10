import { spawn } from "node:child_process";

const port = 3101;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env: { ...process.env, DATABASE_URL: "", ADMIN_API_TOKEN: "test-admin-token", PRIVACY_HASH_PEPPER: "test-pepper" },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/complaints`); if (response.ok) return; } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js test server did not start.");
}

function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  await waitForServer();
  const wrongType = await fetch(`http://127.0.0.1:${port}/api/complaints`, { method: "POST", body: "{}" });
  assert(wrongType.status === 415, "Non-JSON submissions must be rejected");
  const crossOrigin = await fetch(`http://127.0.0.1:${port}/api/complaints`, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: "{}" });
  assert(crossOrigin.status === 403, "Cross-origin submissions must be rejected");
  const response = await fetch(`http://127.0.0.1:${port}/api/complaints`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Contact test@example.com", text: "Call 9876543210 because the wifi repeatedly disconnects during class.", facility: "CL3", category: "Network", rating: 2, anonymous: false, reporterName: "Private Student" }),
  });
  assert(response.status === 201, `Valid complaint failed with ${response.status}`);
  const payload = await response.json();
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("test@example.com") && !serialized.includes("9876543210") && !serialized.includes("Private Student"), "PII escaped redaction");
  assert(payload.complaint.title.includes("[email removed]"), "Title PII was not redacted");
  const publicRead = await (await fetch(`http://127.0.0.1:${port}/api/complaints`)).json();
  assert(!JSON.stringify(publicRead).includes("reporterName"), "Public API includes named reporter fields");
  console.log("API privacy/security contract passed");
} finally {
  child.kill("SIGTERM");
}
