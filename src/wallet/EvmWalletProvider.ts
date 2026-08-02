import { BrowserProvider, Contract, parseUnits, type Eip1193Provider } from "ethers";
import type {
  PaymentResult,
  SendPaymentParams,
  WalletProvider,
} from "./WalletProvider";
import { config } from "@/lib/config";
import { USDT_ESCROW_ABI, usdtDealReference } from "@/lib/usdtEscrow";

/**
 * EVM wallet provider for USDT (and any ERC-20). Talks to whatever wallet
 * has injected `window.ethereum`. Inside Nimiq Pay that is the host's EVM
 * bridge; in a normal browser it's MetaMask/Rabby/etc.
 *
 * Historic deals transfer to managed custody. New USDT deals approve and fund
 * the immutable Polygon escrow contract.
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

  async prepareSwitch() {
    const eth = this.#requireEthereum();
    try {
      await eth.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (error) {
      const code = (error as { code?: number } | null)?.code;
      // Some injected wallets do not implement permission requests. Their
      // normal account request is still used during the new login attempt.
      if (code !== -32601 && code !== 4200) throw error;
    }
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
      [
        "function transfer(address to, uint256 value) returns (bool)",
        "function approve(address spender, uint256 value) returns (bool)",
      ],
      signer
    );

    const amount = parseUnits(params.amount, config.usdt.decimals);
    if (params.escrowModel === "smart_contract") {
      if (!params.dealId || !params.seller) {
        throw new Error("The USDT escrow payment is missing deal details.");
      }
      const escrowAddress = params.to || config.usdt.escrowContractAddress;
      params.onProgress?.("approval_prompt");
      const approval = await token.approve(
        escrowAddress,
        amount
      );
      params.onProgress?.("approval_pending");
      // Funding must wait until the allowance is mined. The contract cannot
      // transfer the approved USDT before Polygon records this transaction.
      await approval.wait();
      params.onProgress?.("funding_prompt");
      const escrow = new Contract(
        escrowAddress,
        USDT_ESCROW_ABI,
        signer
      );
      const tx = await escrow.fund(
        usdtDealReference(params.dealId),
        params.seller,
        amount,
        params.feeBps ?? 0
      );
      params.onProgress?.("funding_submitted");
      return { txHash: tx.hash };
    }

    const tx = await token.transfer(config.usdt.custodyAddress, amount);
    // Do not await tx.wait(). Nimiq Pay closes the confirmation modal once
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
    return { signature }; // EVM does not need a public key because the address is recoverable from the signature
  }
}
