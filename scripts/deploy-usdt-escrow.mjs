import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress,
} from "ethers";
import { artifact, compileContracts } from "./solidity-utils.mjs";

const rpcUrl = process.env.POLYGON_RPC_URL?.trim();
const deployerKey = process.env.ESCROW_DEPLOYER_PRIVATE_KEY?.trim();
const tokenAddress =
  process.env.USDT_CONTRACT?.trim()
  || process.env.VITE_USDT_CONTRACT_ADDR?.trim();
const arbitrator = process.env.EVM_ARBITRATOR_ADDRESS?.trim();
const treasury = process.env.ESCROW_TREASURY_ADDRESS?.trim();

if (!rpcUrl || !deployerKey || !tokenAddress || !arbitrator || !treasury) {
  throw new Error(
    "Set POLYGON_RPC_URL, ESCROW_DEPLOYER_PRIVATE_KEY, USDT_CONTRACT, " +
      "EVM_ARBITRATOR_ADDRESS, and ESCROW_TREASURY_ADDRESS before deployment.",
  );
}

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 137n) {
  throw new Error(`Refusing deployment on chain ${network.chainId}; Polygon 137 required.`);
}

const deployer = new Wallet(deployerKey, provider);
const contracts = compileContracts();
const escrowArtifact = artifact(
  contracts,
  "contracts/XcrowHubEscrowV2.sol",
  "XcrowHubEscrowV2",
);
const factory = new ContractFactory(
  escrowArtifact.abi,
  escrowArtifact.bytecode,
  deployer,
);
const contract = await factory.deploy(
  getAddress(tokenAddress),
  getAddress(arbitrator),
  getAddress(treasury),
);
const deployment = contract.deploymentTransaction();
await contract.waitForDeployment();

console.log(`XcrowHubEscrowV2=${await contract.getAddress()}`);
console.log(`deploymentTx=${deployment?.hash ?? "unknown"}`);
console.log(`deployer=${deployer.address}`);
console.log(`chainId=${network.chainId}`);
