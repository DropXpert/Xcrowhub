import HubApi from "@nimiq/hub-api";
import type {
  AuthChallenge,
  PaymentResult,
  SendPaymentParams,
  SignResult,
  WalletAuthentication,
  WalletProvider,
} from "./WalletProvider";
import { config } from "@/lib/config";
import { NIMIQ_WEB_WALLET_URL } from "@/lib/host";

const APP_NAME = "XcrowHub";
export { NIMIQ_WEB_WALLET_URL };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nimToLunas(amount: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid NIM amount: ${amount}`);
  }
  return Math.round(value * 100_000);
}

function normalizeNimAddress(address: string): string {
  const compact = address.replace(/\s+/g, "").toUpperCase();
  if (!/^NQ\d{2}[A-Z0-9]{32}$/.test(compact)) {
    throw new Error("The configured Nimiq custody address is invalid.");
  }
  return compact.match(/.{1,4}/g)!.join(" ");
}

function friendlyHubError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/cancel/i.test(message)) return new Error("Wallet connection was cancelled.");
  if (/popup|window/i.test(message)) {
    return new Error("Allow popups for XcrowHub, then try connecting again.");
  }
  if (/account|wallet|login|not found/i.test(message)) {
    return new Error("No browser wallet was found. Create or restore a Nimiq wallet, then try again.");
  }
  return new Error(message || "Could not open the Nimiq browser wallet.");
}

/**
 * Standard-browser NIM provider. Nimiq Hub opens the user's web wallet in an
 * isolated origin; XcrowHub receives only an address, signatures and tx hash.
 */
export class NimiqHubWalletProvider implements WalletProvider {
  readonly name = "Nimiq Browser Wallet";
  private readonly hub = new HubApi(
    config.nimiq.network === "test"
      ? "https://hub.nimiq-testnet.com"
      : "https://hub.nimiq.com",
  );
  private selectedAddress: string | null = null;

  async isAvailable() {
    return typeof window !== "undefined" && navigator.onLine;
  }

  async getAddress(): Promise<string> {
    if (this.selectedAddress) return this.selectedAddress;
    try {
      const result = await this.hub.chooseAddress({ appName: APP_NAME });
      this.selectedAddress = result.address;
      return result.address;
    } catch (error) {
      throw friendlyHubError(error);
    }
  }

  async authenticate(
    loadChallenge: () => Promise<AuthChallenge>,
  ): Promise<WalletAuthentication> {
    // Start the request immediately during the click. Hub accepts a promised
    // request, so its popup opens before the nonce fetch resolves.
    const challengePromise = loadChallenge();
    try {
      const signed = await this.hub.signMessage(
        challengePromise.then((challenge) => ({
          appName: APP_NAME,
          message: challenge.message,
          signer: this.selectedAddress ?? undefined,
        })),
      );
      const challenge = await challengePromise;
      this.selectedAddress = signed.signer;
      return {
        address: signed.signer,
        signature: bytesToHex(signed.signature),
        publicKey: bytesToHex(signed.signerPublicKey),
        nonce: challenge.nonce,
        message: challenge.message,
      };
    } catch (error) {
      // Prevent an unobserved fetch rejection if the user closes Hub early.
      await challengePromise.catch(() => undefined);
      throw friendlyHubError(error);
    }
  }

  async signMessage(message: string): Promise<SignResult> {
    try {
      const signed = await this.hub.signMessage({
        appName: APP_NAME,
        message,
        signer: this.selectedAddress ?? undefined,
      });
      this.selectedAddress = signed.signer;
      return {
        signature: bytesToHex(signed.signature),
        publicKey: bytesToHex(signed.signerPublicKey),
      };
    } catch (error) {
      throw friendlyHubError(error);
    }
  }

  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    return this.sendPaymentWhenReady(Promise.resolve(params));
  }

  async sendPaymentWhenReady(
    paramsPromise: Promise<SendPaymentParams>,
  ): Promise<PaymentResult> {
    try {
      const result = await this.hub.checkout(
        paramsPromise.then((params) => {
          if (params.currency !== "NIM") {
            throw new Error("Nimiq Hub only handles NIM payments.");
          }
          return {
            appName: APP_NAME,
            shopLogoUrl: `${window.location.origin}/logo-icon.png`,
            sender: params.from ?? this.selectedAddress ?? undefined,
            forceSender: Boolean(params.from ?? this.selectedAddress),
            recipient: normalizeNimAddress(config.nimiq.custodyAddress),
            value: nimToLunas(params.amount),
            extraData: params.memo,
          };
        }),
      );
      this.selectedAddress = result.raw.sender;
      return { txHash: result.hash };
    } catch (error) {
      throw friendlyHubError(error);
    }
  }
}
