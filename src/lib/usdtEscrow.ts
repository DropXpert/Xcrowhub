import {
  AbiCoder,
  BrowserProvider,
  Contract,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toUtf8Bytes,
  type Eip1193Provider,
} from "ethers";
import { config } from "@/lib/config";
import type { Deal } from "@/types/deal";

export const USDT_ESCROW_ABI = [
  "function fund(bytes32 dealReference,address seller,uint256 amount,uint16 feeBps)",
  "function release(bytes32 dealReference)",
  "function refund(bytes32 dealReference,address buyer)",
  "function settle(bytes32 dealReference,address buyer,uint256 buyerAmount,uint256 sellerAmount,uint256 nonce,uint256 deadline,bytes signatureA,bytes signatureB)",
  "function escrowKey(bytes32 dealReference,address buyer) pure returns (bytes32)",
  "function escrows(bytes32 escrowKey) view returns (address buyer,address seller,uint256 amount,uint256 nonce,uint16 feeBps,uint8 state)",
  "event EscrowFunded(bytes32 indexed escrowKey,address indexed buyer,address indexed seller,uint256 amount,uint16 feeBps)",
  "event SettlementExecuted(bytes32 indexed escrowKey,address indexed buyer,address indexed seller,uint256 buyerAmount,uint256 sellerAmount,uint256 feeAmount,address executor)",
] as const;

export const USDT_SETTLEMENT_TYPES = {
  Settlement: [
    { name: "escrowKey", type: "bytes32" },
    { name: "buyerAmount", type: "uint256" },
    { name: "sellerAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export interface SettlementProposal {
  dealId: string;
  decision: "release_to_seller" | "refund_to_buyer" | "partial_refund";
  buyerAmount: string;
  sellerAmount: string;
  nonce: number;
  deadline: string;
  arbitratorSignature?: string;
  status: "awaiting_signature" | "ready" | "submitted" | "confirmed";
  settlementTxHash?: string;
}

export function usdtDealReference(dealId: string): string {
  return keccak256(toUtf8Bytes(dealId));
}

export function usdtEscrowKey(dealId: string, buyerAddress: string): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address"],
      [usdtDealReference(dealId), getAddress(buyerAddress)]
    )
  );
}

export function isSmartUsdtDeal(deal: Deal): boolean {
  return deal.priceCurrency === "USDT" && deal.escrowModel === "smart_contract";
}

export function settlementTypedData(
  proposal: SettlementProposal,
  buyerAddress: string,
  contractAddress = config.usdt.escrowContractAddress
) {
  const deadline = BigInt(Math.floor(new Date(proposal.deadline).getTime() / 1000));
  if (deadline <= 0n) throw new Error("Invalid settlement deadline.");
  return {
    domain: {
      name: "XcrowHub Escrow",
      version: "2",
      chainId: config.usdt.chainId,
      verifyingContract: getAddress(contractAddress),
    },
    types: USDT_SETTLEMENT_TYPES,
    value: {
      escrowKey: usdtEscrowKey(proposal.dealId, buyerAddress),
      buyerAmount: parseUnits(proposal.buyerAmount, config.usdt.decimals),
      sellerAmount: parseUnits(proposal.sellerAmount, config.usdt.decimals),
      nonce: BigInt(proposal.nonce),
      deadline,
    },
  };
}

function ethereum(contractAddress?: string): Eip1193Provider {
  const provider = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!provider) {
    throw new Error("No EVM wallet detected. Open XcrowHub in Nimiq Pay or connect a browser wallet.");
  }
  const target = contractAddress || config.usdt.escrowContractAddress;
  if (!isAddress(target) || /^0x0{40}$/i.test(target)) {
    throw new Error("USDT smart-contract escrow is not configured.");
  }
  return provider;
}

async function contractWithSigner(
  contractAddress = config.usdt.escrowContractAddress
) {
  const provider = new BrowserProvider(ethereum(contractAddress));
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.usdt.chainId) {
    throw new Error(`Switch your wallet to Polygon (chain ${config.usdt.chainId}) and retry.`);
  }
  return new Contract(
    contractAddress,
    USDT_ESCROW_ABI,
    await provider.getSigner()
  );
}

export async function releaseUsdtEscrow(
  dealId: string,
  contractAddress?: string
): Promise<string> {
  const contract = await contractWithSigner(contractAddress);
  const tx = await contract.release(usdtDealReference(dealId));
  return tx.hash as string;
}

export async function refundUsdtEscrow(
  dealId: string,
  buyerAddress: string,
  contractAddress?: string
): Promise<string> {
  const contract = await contractWithSigner(contractAddress);
  const tx = await contract.refund(
    usdtDealReference(dealId),
    getAddress(buyerAddress)
  );
  return tx.hash as string;
}

export async function signAndSettleUsdtEscrow(
  proposal: SettlementProposal,
  buyerAddress: string,
  contractAddress = config.usdt.escrowContractAddress
): Promise<string> {
  if (!proposal.arbitratorSignature) {
    throw new Error("The arbitrator settlement signature is not ready yet.");
  }
  const provider = new BrowserProvider(ethereum(contractAddress));
  const signer = await provider.getSigner();
  const typed = settlementTypedData(proposal, buyerAddress, contractAddress);
  const partySignature = await signer.signTypedData(
    typed.domain,
    typed.types,
    typed.value
  );
  const contract = new Contract(
    contractAddress,
    USDT_ESCROW_ABI,
    signer
  );
  const tx = await contract.settle(
    usdtDealReference(proposal.dealId),
    getAddress(buyerAddress),
    typed.value.buyerAmount,
    typed.value.sellerAmount,
    typed.value.nonce,
    typed.value.deadline,
    proposal.arbitratorSignature,
    partySignature
  );
  return tx.hash as string;
}
