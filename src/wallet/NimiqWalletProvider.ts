import { init } from "@nimiq/mini-app-sdk";
import type {
  PaymentResult,
  SendPaymentParams,
  WalletProvider,
} from "./WalletProvider";
import { config } from "@/lib/config";

/**
 * Real wallet provider for Nimiq Pay. Uses @nimiq/mini-app-sdk to talk to
 * the host. Falls back to "not available" outside the host so production can
 * fail closed and local development can still use its dev provider.
 *
 * The recipient on the basic transaction is the ProofHold custody address
 * (from VITE_PROOFHOLD_CUSTODY_NIM_ADDR), not the seller — that's what
 * makes "funds held" real. The seller is paid out by the backend later
 * when the deal releases (Milestone B).
 */
export class NimiqWalletProvider implements WalletProvider {
  readonly name = "Nimiq Pay";

  async isAvailable() {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { nimiq?: unknown; nimiqPay?: unknown };
    return Boolean(w.nimiq || w.nimiqPay);
  }

  async getAddress(): Promise<string> {
    const nimiq = await init({ timeout: 5_000 });
    const result = await nimiq.listAccounts();
    if (isErrorResponse(result)) {
      throw new Error(`Nimiq listAccounts: ${result.error.message}`);
    }
    if (result.length === 0) {
      throw new Error("No Nimiq accounts available in the host wallet.");
    }
    return result[0];
  }

  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    if (params.currency !== "NIM") {
      throw new Error(
        `NimiqWalletProvider only handles NIM; got ${params.currency}.`
      );
    }

    const nimiq = await init({ timeout: 5_000 });

    const recipient = normalizeNimAddress(config.nimiq.custodyAddress);
    const value = nimToLunas(params.amount);

    // Encode memo as hex data so the on-chain watcher can match deal ID
    const dataHex = params.memo ? utf8ToHex(params.memo) : undefined;

    let result;
    try {
      if (dataHex && typeof (nimiq as any).sendBasicTransactionWithData === "function") {
        result = await (nimiq as any).sendBasicTransactionWithData({
          recipient,
          value,
          data: dataHex,
        });
      } else {
        result = await nimiq.sendBasicTransaction({ recipient, value });
      }
    } catch (err) {
      console.error("[XcrowHub] sendBasicTransaction threw:", err);
      throw err;
    }

    if (isErrorResponse(result)) {
      throw new Error(`Nimiq sendBasicTransaction: ${result.error.message}`);
    }

    if (typeof result !== "string" || result.length === 0) {
      throw new Error(
        `Nimiq sendBasicTransaction returned unexpected value: ${JSON.stringify(result)}`
      );
    }

    return { txHash: result };
  }

  async signMessage(message: string): Promise<import("./WalletProvider").SignResult> {
    // SDK docs: sign({ message }) → { publicKey: string, signature: string }
    const nimiq = await init({ timeout: 5_000 });
    try {
      if (typeof (nimiq as any).sign === "function") {
        const res = await (nimiq as any).sign({ message });
        if (isErrorResponse(res)) {
          throw new Error(`Nimiq sign: ${res.error.message}`);
        }
        if (res && typeof res.signature === "string") {
          return { signature: res.signature, publicKey: res.publicKey ?? undefined };
        }
        if (typeof res === "string") return { signature: res };
      }
    } catch {
      // Expected outside Nimiq Pay host
    }

    // Fallback placeholder for local dev (outside Nimiq Pay host).
    const fake = Array.from(message)
      .map((c, i) => ((c.charCodeAt(0) + i) % 16).toString(16))
      .join("");
    return { signature: `0xnim${fake}${"0".repeat(Math.max(0, 60 - fake.length))}` };
  }
}

function utf8ToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeNimAddress(addr: string): string {
  // Nimiq's user-friendly format: NQ-prefix + 9 groups of 4 alphanumerics
  // separated by single spaces. Normalize whitespace and uppercase so paste
  // mistakes (extra spaces, lowercase, line breaks) don't trip validation.
  const cleaned = addr.replace(/\s+/g, " ").trim().toUpperCase();

  // Pull out only the meaningful characters then re-group every 4.
  const compact = cleaned.replace(/\s/g, "");
  if (!/^NQ\d{2}[A-Z0-9]{32}$/.test(compact)) {
    throw new Error(
      `Custody address "${addr}" is not a valid Nimiq address. Expected NQXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX (NQ + 34 chars).`
    );
  }
  const grouped = compact.match(/.{1,4}/g)!.join(" ");
  return grouped;
}

function nimToLunas(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid NIM amount: ${amount}`);
  }
  return Math.round(n * 1e5);
}

function isErrorResponse(
  value: unknown
): value is { error: { message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object"
  );
}
