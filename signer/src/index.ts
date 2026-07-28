/**
 * Xcrow custody signer.
 *
 * Exactly-once invariant: for every required `reference`, the fully signed raw
 * transaction and its deterministic hash are appended + fsync'd to a durable
 * ledger before the first network broadcast.  A retry or restart can therefore
 * only rebroadcast that same raw transaction, never create a second spend.
 *
 * Production must run one signer replica with SIGNER_IDEMPOTENCY_FILE located
 * on a persistent volume.  All signing is serialized, which also prevents two
 * different EVM payouts from selecting the same account nonce.
 */

import "dotenv/config";
import express from "express";
import {
  Interface,
  JsonRpcProvider,
  Transaction as EthersTransaction,
  Wallet,
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
} from "ethers";
import { MnemonicUtils, KeyPair, TransactionBuilder, Address } from "@nimiq/core";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  truncateSync,
  writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const PORT = Number(process.env.PORT || "8787");
const SHARED_SECRET = process.env.SIGNER_SHARED_SECRET || "";
const NIM_SEED = process.env.NIM_CUSTODY_SEED || "";
const EVM_PRIV = process.env.EVM_CUSTODY_PRIVATE_KEY || "";
const NIM_RPC = process.env.NIM_RPC || "https://rpc.nimiqwatch.com";
const EVM_RPC = process.env.EVM_RPC || "https://polygon-rpc.com";
const USDT_CONTRACT = process.env.USDT_CONTRACT || "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_DECIMALS = Number(process.env.USDT_DECIMALS || "6");
const IDEMPOTENCY_FILE = resolve(
  process.env.SIGNER_IDEMPOTENCY_FILE || "./data/payout-idempotency.jsonl",
);

// A missing secret must stop the process, not merely emit a warning.  With an
// empty configured secret, malformed Bearer auth can otherwise become a bypass.
if (!SHARED_SECRET || SHARED_SECRET === "change-me-to-a-long-random-value") {
  throw new Error("SIGNER_SHARED_SECRET is required and must not be the placeholder");
}
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
if (!Number.isInteger(USDT_DECIMALS) || USDT_DECIMALS < 0 || USDT_DECIMALS > 36) {
  throw new Error("USDT_DECIMALS must be an integer from 0 to 36");
}

type Network = "nimiq" | "evm";
type Currency = "NIM" | "USDT";

interface NormalizedPayout {
  reference: string;
  network: Network;
  currency: Currency;
  to: string;
  amount: string;
  fingerprint: string;
}

interface StoredPayout extends NormalizedPayout {
  rawTransaction: string;
  txHash: string;
  status: "prepared" | "broadcast";
  preparedAt: string;
  broadcastAt?: string;
}

type LedgerEvent =
  | { version: 1; type: "prepared"; payout: StoredPayout }
  | { version: 1; type: "broadcast"; reference: string; txHash: string; at: string };

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Append-only journal.  Each transition is one newline-terminated JSON record
 * and is fsync'd before returning.  A crash may leave only the final line
 * incomplete; it is truncated during replay while all complete lines are strict.
 */
class IdempotencyLedger {
  private readonly payouts = new Map<string, StoredPayout>();
  private readonly txOwners = new Map<string, string>();
  private readonly fd: number;
  private fault: Error | null = null;

  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    const alreadyExisted = existsSync(filePath);
    this.replay();
    this.fd = openSync(filePath, "a", 0o600);
    if (!alreadyExisted) this.syncParentDirectory();
  }

  private syncParentDirectory() {
    // fsync the directory entry as well as file contents.  Linux production
    // volumes support this; Windows does not expose directory fsync to Node.
    if (process.platform === "win32") {
      console.warn("[signer] Windows cannot fsync the idempotency-ledger directory entry");
      return;
    }
    const directoryFd = openSync(dirname(this.filePath), "r");
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  }

  private replay() {
    if (!existsSync(this.filePath)) return;
    let contents = readFileSync(this.filePath);

    // A killed process can leave a partial final write.  Drop it before opening
    // O_APPEND; otherwise the next JSON event would be glued to corrupt bytes.
    if (contents.length > 0 && contents[contents.length - 1] !== 0x0a) {
      const lastNewline = contents.lastIndexOf(0x0a);
      const validLength = lastNewline < 0 ? 0 : lastNewline + 1;
      truncateSync(this.filePath, validLength);
      contents = contents.subarray(0, validLength);
      console.warn("[signer] truncated an incomplete final idempotency-ledger line");
    }

    const lines = contents.toString("utf8").split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) continue;
      let event: LedgerEvent;
      try {
        event = JSON.parse(line) as LedgerEvent;
      } catch (error) {
        throw new Error(`Corrupt signer idempotency ledger at line ${index + 1}: ${(error as Error).message}`);
      }
      this.applyEvent(event, true);
    }
  }

  private applyEvent(event: LedgerEvent, replaying: boolean) {
    if (!event || event.version !== 1) throw new Error("Unsupported signer ledger event");
    if (event.type === "prepared") {
      const payout = event.payout;
      if (!payout?.reference || !payout.rawTransaction || !payout.txHash || !payout.fingerprint ||
          payout.status !== "prepared") {
        throw new Error("Invalid prepared payout in signer ledger");
      }
      const existing = this.payouts.get(payout.reference);
      if (existing && (existing.fingerprint !== payout.fingerprint || existing.txHash !== payout.txHash)) {
        throw new Error(`Conflicting prepared records for ${payout.reference}`);
      }
      const chainHashKey = `${payout.network}:${payout.txHash.toLowerCase()}`;
      const hashOwner = this.txOwners.get(chainHashKey);
      if (hashOwner && hashOwner !== payout.reference) {
        throw new Error(`One signed transaction is assigned to multiple payout references: ${hashOwner}, ${payout.reference}`);
      }
      this.txOwners.set(chainHashKey, payout.reference);
      this.payouts.set(payout.reference, existing?.status === "broadcast" ? existing : payout);
      return;
    }
    if (event.type === "broadcast") {
      const existing = this.payouts.get(event.reference);
      if (!existing) throw new Error(`Broadcast ledger event has no prepared record: ${event.reference}`);
      if (existing.txHash.toLowerCase() !== event.txHash.toLowerCase()) {
        throw new Error(`Broadcast hash conflicts with prepared record: ${event.reference}`);
      }
      this.payouts.set(event.reference, {
        ...existing,
        status: "broadcast",
        broadcastAt: event.at,
      });
      return;
    }
    if (replaying) throw new Error("Unknown signer ledger event type");
  }

  private append(event: LedgerEvent) {
    this.assertHealthy();
    try {
      const encoded = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
      let offset = 0;
      while (offset < encoded.length) {
        const written = writeSync(this.fd, encoded, offset, encoded.length - offset);
        if (written <= 0) throw new Error("Signer idempotency ledger write made no progress");
        offset += written;
      }
      fsyncSync(this.fd);
      this.applyEvent(event, false);
    } catch (error) {
      this.fault = error instanceof Error ? error : new Error(String(error));
      throw this.fault;
    }
  }

  private assertHealthy() {
    if (this.fault) {
      throw new Error(`Signer idempotency ledger is faulted; restart/recover before payouts: ${this.fault.message}`);
    }
  }

  get(reference: string): StoredPayout | undefined {
    this.assertHealthy();
    return this.payouts.get(reference);
  }

  prepared(): StoredPayout[] {
    this.assertHealthy();
    return [...this.payouts.values()].filter((payout) => payout.status === "prepared");
  }

  maxEvmNonce(): number {
    this.assertHealthy();
    let maximum = -1;
    for (const payout of this.payouts.values()) {
      if (payout.network !== "evm") continue;
      const nonce = EthersTransaction.from(payout.rawTransaction).nonce;
      if (nonce > maximum) maximum = nonce;
    }
    return maximum;
  }

  savePrepared(payout: StoredPayout) {
    this.assertHealthy();
    const existing = this.payouts.get(payout.reference);
    if (existing) {
      if (existing.fingerprint !== payout.fingerprint || existing.txHash !== payout.txHash) {
        throw new Error(`Idempotency reference collision: ${payout.reference}`);
      }
      return;
    }
    this.append({ version: 1, type: "prepared", payout });
  }

  markBroadcast(reference: string, txHash: string) {
    this.assertHealthy();
    const existing = this.payouts.get(reference);
    if (!existing) throw new Error(`Cannot complete unknown payout ${reference}`);
    if (existing.txHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new Error(`Network returned the wrong hash for ${reference}`);
    }
    if (existing.status === "broadcast") return;
    this.append({
      version: 1,
      type: "broadcast",
      reference,
      txHash: existing.txHash,
      at: new Date().toISOString(),
    });
  }

  close() {
    closeSync(this.fd);
  }

  isHealthy(): boolean {
    return this.fault === null;
  }
}

const ledger = new IdempotencyLedger(IDEMPOTENCY_FILE);

// One queue for all payouts is deliberate: wallet nonce selection and durable
// persistence must not interleave, even for different idempotency references.
let signingQueue: Promise<void> = Promise.resolve();
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = signingQueue.then(work, work);
  signingQueue = result.then(() => undefined, () => undefined);
  return result;
}

const app = express();
app.use(express.json({ limit: "32kb" }));

app.post("/sign-and-broadcast", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== SHARED_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payout = normalizePayout(req.body);
    const result = await enqueue(() => processPayout(payout));
    return res.json({
      txHash: result.txHash,
      status: result.status,
      idempotent: result.idempotent,
    });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    console.error("[signer] payout error", error?.message || error);
    return res.status(status).json({ error: error?.message || "Internal signer error" });
  }
});

async function processPayout(payout: NormalizedPayout): Promise<{
  txHash: string;
  status: "broadcast";
  idempotent: boolean;
}> {
  const existing = ledger.get(payout.reference);
  if (existing) {
    if (existing.fingerprint !== payout.fingerprint) {
      throw new HttpError(409, "Idempotency reference was already used with different payout parameters");
    }
    if (existing.status === "broadcast") {
      return { txHash: existing.txHash, status: "broadcast", idempotent: true };
    }

    // A previous call/restart stopped after durable preparation.  Broadcast the
    // exact same bytes; never sign a replacement transaction for this reference.
    await broadcastPrepared(existing);
    ledger.markBroadcast(existing.reference, existing.txHash);
    return { txHash: existing.txHash, status: "broadcast", idempotent: true };
  }

  const prepared = payout.network === "nimiq"
    ? await prepareNimTransaction(payout)
    : await prepareNewEvmTransaction(payout);

  // This fsync is the critical ordering boundary: no chain call happens first.
  ledger.savePrepared(prepared);
  await broadcastPrepared(prepared);
  ledger.markBroadcast(prepared.reference, prepared.txHash);
  return { txHash: prepared.txHash, status: "broadcast", idempotent: false };
}

async function prepareNewEvmTransaction(payout: NormalizedPayout): Promise<StoredPayout> {
  // Do not create later nonces behind an unresolved raw transaction.  Retrying
  // the older reference must either broadcast it or keep the signer fail-closed.
  const unresolved = ledger.prepared().find((item) => item.network === "evm");
  if (unresolved) {
    throw new HttpError(503, `An earlier EVM payout is awaiting safe rebroadcast: ${unresolved.reference}`);
  }
  return await prepareEvmTransaction(payout);
}

function normalizePayout(body: any): NormalizedPayout {
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (!reference || reference.length > 240) {
    throw new HttpError(400, "A payout idempotency reference is required");
  }

  const network = body?.network as Network;
  const currency = body?.currency as Currency;
  if (!((network === "nimiq" && currency === "NIM") || (network === "evm" && currency === "USDT"))) {
    throw new HttpError(400, `Unsupported network/currency: ${String(network)}/${String(currency)}`);
  }

  const rawAmount = typeof body?.amount === "string" || typeof body?.amount === "number"
    ? String(body.amount)
    : "";
  const decimals = currency === "NIM" ? 5 : USDT_DECIMALS;
  let units: bigint;
  try {
    units = parseUnits(rawAmount, decimals);
  } catch {
    throw new HttpError(400, `Amount must be a decimal with at most ${decimals} places`);
  }
  if (units <= 0n) throw new HttpError(400, "Payout amount must be positive");
  const amount = formatUnits(units, decimals);

  const rawTo = typeof body?.to === "string" ? body.to.trim() : "";
  if (!rawTo) throw new HttpError(400, "Payout recipient is required");
  let to: string;
  try {
    to = network === "evm"
      ? getAddress(rawTo)
      : Address.fromAny(rawTo).toUserFriendlyAddress();
  } catch {
    throw new HttpError(400, "Payout recipient address is invalid");
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ network, currency, to: to.toLowerCase(), amount }))
    .digest("hex");
  return { reference, network, currency, to, amount, fingerprint };
}

async function prepareNimTransaction(payout: NormalizedPayout): Promise<StoredPayout> {
  if (!NIM_SEED) throw new Error("NIM_CUSTODY_SEED is not configured");

  const words = NIM_SEED.trim().split(/\s+/);
  const extKey = MnemonicUtils.mnemonicToExtendedPrivateKey(words, "");
  const keyPair = KeyPair.derive(extKey.derivePath("m/44'/242'/0'/0'").privateKey);
  const sender = keyPair.publicKey.toAddress();
  const recipient = Address.fromAny(payout.to);
  const valueLunas = parseUnits(payout.amount, 5);
  const validityStartHeight = await getNimValidityStartHeight();

  // Nimiq basic transfers have no account nonce.  Without reference-derived
  // data, two same-block payouts with equal recipient + amount serialize to the
  // same transaction and only one transfer occurs.  A 32-byte reference digest
  // keeps every economic payout unique while remaining under the 64-byte limit.
  const referenceData = createHash("sha256").update(payout.reference).digest();
  const tx = TransactionBuilder.newBasicWithData(
    sender,
    recipient,
    referenceData,
    valueLunas,
    undefined,
    validityStartHeight,
    24,
  );
  tx.sign(keyPair, undefined);

  return {
    ...payout,
    rawTransaction: tx.toHex(),
    txHash: tx.hash(),
    status: "prepared",
    preparedAt: new Date().toISOString(),
  };
}

async function getNimValidityStartHeight(): Promise<number> {
  const result = await nimRpc("getBlockNumber", []);
  const raw = result?.data ?? result;
  const height = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("Could not determine Nimiq chain height; refusing height 0");
  }
  return Math.max(0, height - 2);
}

async function prepareEvmTransaction(payout: NormalizedPayout): Promise<StoredPayout> {
  if (!EVM_PRIV) throw new Error("EVM_CUSTODY_PRIVATE_KEY is not configured");

  const provider = new JsonRpcProvider(EVM_RPC);
  const wallet = new Wallet(EVM_PRIV, provider);
  const tokenAddress = getAddress(USDT_CONTRACT);
  const tokenInterface = new Interface(["function transfer(address to, uint256 value) returns (bool)"]);
  const value = parseUnits(payout.amount, USDT_DECIMALS);
  const chainNonce = await provider.getTransactionCount(wallet.address, "pending");
  const nonce = Math.max(chainNonce, ledger.maxEvmNonce() + 1);
  const transaction = await wallet.populateTransaction({
    to: tokenAddress,
    data: tokenInterface.encodeFunctionData("transfer", [payout.to, value]),
    value: 0n,
    nonce,
  });
  const rawTransaction = await wallet.signTransaction(transaction);

  return {
    ...payout,
    rawTransaction,
    txHash: keccak256(rawTransaction),
    status: "prepared",
    preparedAt: new Date().toISOString(),
  };
}

async function broadcastPrepared(payout: StoredPayout): Promise<void> {
  if (payout.network === "nimiq") {
    await broadcastPreparedNim(payout);
  } else {
    await broadcastPreparedEvm(payout);
  }
}

async function broadcastPreparedNim(payout: StoredPayout): Promise<void> {
  try {
    const result = await nimRpc("sendRawTransaction", [payout.rawTransaction]);
    const networkHash = typeof result === "string"
      ? result
      : typeof result?.data === "string"
      ? result.data
      : "";
    if (!networkHash) throw new Error("Nimiq broadcast returned no transaction hash");
    if (networkHash.toLowerCase() !== payout.txHash.toLowerCase()) {
      throw new Error("Nimiq RPC returned a hash different from the signed transaction");
    }
  } catch (error: any) {
    const message = String(error?.message || error).toLowerCase();
    // Duplicate responses mean this exact raw transaction reached the network
    // during an earlier attempt whose HTTP response was lost.
    if (message.includes("already known") || message.includes("already exists") ||
        message.includes("known transaction") || message.includes("already included")) {
      return;
    }
    throw error;
  }
}

async function broadcastPreparedEvm(payout: StoredPayout): Promise<void> {
  const provider = new JsonRpcProvider(EVM_RPC);

  // On retry, query first.  This handles a crash after broadcast but before the
  // ledger's broadcast marker without relying on provider-specific error text.
  const known = await provider.getTransaction(payout.txHash).catch(() => null);
  if (known) return;

  try {
    const response = await provider.broadcastTransaction(payout.rawTransaction);
    if (response.hash.toLowerCase() !== payout.txHash.toLowerCase()) {
      throw new Error("EVM RPC returned a hash different from the signed transaction");
    }
  } catch (error) {
    // The RPC may have accepted the raw bytes and dropped the response.  Confirm
    // by deterministic hash before declaring failure.  Never treat a bare
    // "nonce too low" as success; another transaction could own that nonce.
    const nowKnown = await provider.getTransaction(payout.txHash).catch(() => null);
    if (nowKnown) return;
    throw error;
  }
}

async function nimRpc(method: string, params: unknown[]): Promise<any> {
  const response = await fetch(NIM_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Nimiq RPC HTTP ${response.status}`);
  const body = await response.json() as any;
  if (body?.error) throw new Error(`Nimiq RPC error: ${JSON.stringify(body.error)}`);
  return body?.result;
}

app.get("/health", (_req, res) => {
  if (!ledger.isHealthy()) return res.status(503).json({ ok: false });
  return res.json({ ok: true });
});

async function start() {
  // Recovery happens before the port opens.  Otherwise a newly prepared EVM
  // payout could consume the nonce reserved by a pre-crash raw transaction.
  const pending = ledger.prepared();
  if (pending.length) {
    console.warn(`[signer] recovering ${pending.length} prepared payout(s) before accepting traffic`);
  }
  for (const payout of pending) {
    await broadcastPrepared(payout);
    ledger.markBroadcast(payout.reference, payout.txHash);
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Xcrow signer listening on http://127.0.0.1:${PORT}`);
    console.log(`Idempotency ledger: ${IDEMPOTENCY_FILE}`);
  });
}

start().catch((error) => {
  console.error("[signer] startup failed; refusing to accept payouts", error);
  ledger.close();
  process.exitCode = 1;
});
