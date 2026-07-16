import { BrowserProvider, Contract, parseUnits, type Eip1193Provider } from "ethers";
import type {
  PaymentResult,
  SendPaymentParams,
  WalletProvider,
} from "./WalletProvider";
import { config } from "@/lib/config";

/**
 * EVM wallet provider for USDT (and any ERC-20). Talks to whatever wallet
 * has injected `window.ethereum` — inside Nimiq Pay that's the host's EVM
 * bridge; in a normal browser it's MetaMask/Rabby/etc.
 *
 * Like the Nimiq provider, the recipient on the transfer is the ProofHold
 * custody address — not the seller. Funds release happens on the backend
 * in Milestone B.
 */
export class EvmWalletProvider implements WalletProvider {
  readonly name = "EVM wallet (USDT)";

  async isAvailable() {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { ethereum?: Eip1193Provider };
    return Boolean(w.ethereum);
  }

  async getAddress(): Promise<string> {
    const eth = this.#requireEthereum();
    const accounts = (await eth.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error("No EVM accounts available.");
    }
    return accounts[0];
  }

  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    if (params.currency !== "USDT") {
      throw new Error(
        `EvmWalletProvider only handles USDT; got ${params.currency}.`
      );
    }

    const eth = this.#requireEthereum();
    await this.#ensureChain(eth, config.usdt.chainId);

    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();

    const token = new Contract(
      config.usdt.contractAddress,
      ["function transfer(address to, uint256 value) returns (bool)"],
      signer
    );

    const amount = parseUnits(params.amount, config.usdt.decimals);
    const tx = await token.transfer(config.usdt.custodyAddress, amount);
    // Don't await tx.wait() — Nimiq Pay closes the confirmation modal once
    // the user signs; the tx hash is enough for the receipt. Backend will
    // watch for confirmation in Milestone B.
    return { txHash: tx.hash };
  }

  #requireEthereum(): Eip1193Provider {
    const w = window as unknown as { ethereum?: Eip1193Provider };
    if (!w.ethereum) {
      throw new Error(
        "No EVM wallet detected. Open this inside Nimiq Pay or install a Web3 wallet."
      );
    }
    return w.ethereum;
  }

  async #ensureChain(eth: Eip1193Provider, chainId: number) {
    const hex = "0x" + chainId.toString(16);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (err) {
      // 4902 = chain not added in the wallet yet. Many hosts (including
      // Nimiq Pay's EVM bridge) auto-add common chains, so we surface the
      // error rather than guessing the addChain params.
      const code = (err as { code?: number }).code;
      if (code === 4902) {
        throw new Error(
          `Wallet doesn't have chain ${chainId} (${hex}) configured. Add it and retry.`
        );
      }
      throw err;
    }
  }

  async signMessage(message: string): Promise<import("./WalletProvider").SignResult> {
    const eth = this.#requireEthereum();
    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(message);
    return { signature }; // EVM: no publicKey needed — address is recoverable from sig
  }
}
