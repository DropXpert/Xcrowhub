/**
 * Quick smoke-test for the ProofHold signer.
 * Run AFTER starting the server with: npm run dev
 *
 *   node test.mjs
 *
 * Set TO_ADDRESS to any Nimiq address you own — the script sends 0.001 NIM
 * so you can verify it lands on-chain without wasting meaningful funds.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Secret priority: --secret <value>  >  SIGNER_SHARED_SECRET env var  >  .env file
let SHARED_SECRET = "";
const secretArgIdx = process.argv.indexOf("--secret");
if (secretArgIdx !== -1 && process.argv[secretArgIdx + 1]) {
  SHARED_SECRET = process.argv[secretArgIdx + 1];
} else if (process.env.SIGNER_SHARED_SECRET) {
  SHARED_SECRET = process.env.SIGNER_SHARED_SECRET;
} else {
  try {
    const env = readFileSync(resolve(__dir, ".env"), "utf8");
    const match = env.match(/^SIGNER_SHARED_SECRET=(.+)$/m);
    if (match) SHARED_SECRET = match[1].trim();
  } catch {
    // ignore
  }
}

if (!SHARED_SECRET) {
  console.error("ERROR: Could not determine SIGNER_SHARED_SECRET.");
  console.error("Pass it with:  node test.mjs --secret <your-secret>");
  process.exit(1);
}

console.log(`  Using secret: ${SHARED_SECRET.slice(0, 4)}${"*".repeat(Math.max(0, SHARED_SECRET.length - 4))}`);

const BASE = "http://localhost:8787";

// ── Change this to YOUR own Nimiq address for the real-tx test ──
const TO_ADDRESS = "NQ95 TCM8 JTG2 8FAD 9U0M CGQ5 6R7G AAGM LUFF";
// ────────────────────────────────────────────────────────────────

async function test(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    await fn();
    console.log("OK");
  } catch (e) {
    console.log("FAIL:", e.message);
  }
}

async function post(path, body, secret = SHARED_SECRET) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

console.log("\n=== ProofHold signer smoke tests ===\n");

// 1. Health
await test("GET /health → 200 ok:true", async () => {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  if (res.status !== 200 || !data.ok) throw new Error(JSON.stringify(data));
});

// 2. Auth: wrong secret → 401
await test("POST /sign-and-broadcast wrong secret → 401", async () => {
  const { status } = await post("/sign-and-broadcast", { network: "nimiq", currency: "NIM", to: TO_ADDRESS, amount: "0.001" }, "wrong-secret");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

// 3. Missing fields → 400
await test("POST /sign-and-broadcast missing fields → 400", async () => {
  const { status, body } = await post("/sign-and-broadcast", { network: "nimiq" });
  if (status !== 400) throw new Error(`Expected 400, got ${status}: ${JSON.stringify(body)}`);
});

// 4. Unsupported network → 400
await test("POST /sign-and-broadcast bad network → 400", async () => {
  const { status } = await post("/sign-and-broadcast", { network: "bitcoin", currency: "BTC", to: "1A1zP1", amount: "1" });
  if (status !== 400) throw new Error(`Expected 400, got ${status}`);
});

// 5. NIM signing + broadcast (REAL TX — sends 0.001 NIM)
console.log("\n  ⚠  Next test signs + broadcasts a real NIM transaction (0.001 NIM).");
console.log(`     Recipient: ${TO_ADDRESS}`);
console.log("     Edit TO_ADDRESS in test.mjs to use your own address before running.\n");

const YES = process.argv.includes("--send");
if (YES) {
  await test("POST /sign-and-broadcast NIM 0.001 → txHash", async () => {
    const { status, body } = await post("/sign-and-broadcast", {
      network: "nimiq",
      currency: "NIM",
      to: TO_ADDRESS,
      amount: "0.01",
      reference: "smoke-test",
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(body)}`);
    if (!body.txHash) throw new Error(`No txHash in response: ${JSON.stringify(body)}`);
    console.log("\n     txHash:", body.txHash);
    console.log("     Check: https://nimiqwatch.com/transactions/" + body.txHash);
  });
} else {
  console.log("  (skipped real-tx test — rerun with:  node test.mjs --send)\n");
}

console.log("\n=== Done ===\n");
