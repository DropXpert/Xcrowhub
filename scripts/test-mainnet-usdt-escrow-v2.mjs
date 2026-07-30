import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
  parseEther,
  parseUnits,
  toUtf8Bytes,
} from "ethers";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const rpcUrl = process.env.POLYGON_RPC_URL?.trim();
const buyerKey = process.env.ESCROW_DEPLOYER_PRIVATE_KEY?.trim();
const escrowAddress = process.env.VITE_USDT_ESCROW_CONTRACT_ADDR?.trim();
const tokenAddress = process.env.VITE_USDT_CONTRACT_ADDR?.trim();
const expectedArbitrator = process.env.EVM_ARBITRATOR_ADDRESS?.trim();
const expectedTreasury = process.env.ESCROW_TREASURY_ADDRESS?.trim();

if (
  !rpcUrl
  || !buyerKey
  || !escrowAddress
  || !tokenAddress
  || !expectedArbitrator
  || !expectedTreasury
) {
  throw new Error(
    "Missing Polygon RPC, deployer, V2 escrow, token, arbitrator, or treasury configuration.",
  );
}

const provider = new JsonRpcProvider(rpcUrl, 137, { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== 137n) {
  throw new Error(`Refusing mainnet test on chain ${network.chainId}`);
}

const buyer = new Wallet(buyerKey, provider);
const seller = Wallet.createRandom().connect(provider);
const recoveryKeyPath = resolve(
  "tmp",
  "mainnet-escrow-v2-test-seller.key",
);
mkdirSync(dirname(recoveryKeyPath), { recursive: true });
writeFileSync(recoveryKeyPath, `${seller.privateKey}\n`, { mode: 0o600 });
const escrow = new Contract(
  getAddress(escrowAddress),
  [
    "function token() view returns (address)",
    "function arbitrator() view returns (address)",
    "function treasury() view returns (address)",
    "function fund(bytes32 dealReference,address seller,uint256 amount,uint16 feeBps)",
    "function refund(bytes32 dealReference,address buyer)",
    "function escrowKey(bytes32 dealReference,address buyer) pure returns (bytes32)",
    "function escrows(bytes32 escrowKey) view returns (address buyer,address seller,uint256 amount,uint256 nonce,uint16 feeBps,uint8 state)",
  ],
  buyer,
);
const token = new Contract(
  getAddress(tokenAddress),
  [
    "function approve(address spender,uint256 value) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ],
  buyer,
);

const [code, onChainToken, arbitrator, treasury, decimals, symbol] =
  await Promise.all([
    provider.getCode(getAddress(escrowAddress)),
    escrow.token(),
    escrow.arbitrator(),
    escrow.treasury(),
    token.decimals(),
    token.symbol(),
  ]);
if (code === "0x") throw new Error("V2 escrow has no deployed bytecode");
if (getAddress(onChainToken) !== getAddress(tokenAddress)) {
  throw new Error("V2 token does not match configuration");
}
if (getAddress(arbitrator) !== getAddress(expectedArbitrator)) {
  throw new Error("V2 arbitrator does not match configuration");
}
if (getAddress(treasury) !== getAddress(expectedTreasury)) {
  throw new Error("V2 treasury does not match configuration");
}

const amount = parseUnits("1", decimals);
const buyerTokenBefore = await token.balanceOf(buyer.address);
const contractTokenBefore = await token.balanceOf(getAddress(escrowAddress));
if (buyerTokenBefore < amount) {
  throw new Error(
    `Buyer needs 1 ${symbol}; current balance is ${formatUnits(buyerTokenBefore, decimals)}`,
  );
}

// The seller is ephemeral and exists only for this test. It receives enough POL
// to submit the voluntary refund, then returns the unused gas balance.
// Keep a durable local recovery key until every transaction completes. The
// file lives under gitignored tmp/ and is deleted only after the refund and gas
// return are confirmed.
const gasTopUp = parseEther("0.15");
const topUpTx = await buyer.sendTransaction({
  to: seller.address,
  value: gasTopUp,
});
await topUpTx.wait();

const dealReference = keccak256(
  toUtf8Bytes(`xcrowhub-v2-mainnet-roundtrip-${Date.now()}`),
);
const key = await escrow.escrowKey(dealReference, buyer.address);

const approveTx = await token.approve(getAddress(escrowAddress), amount);
await approveTx.wait();
const fundTx = await escrow.fund(dealReference, seller.address, amount, 0);
await fundTx.wait();

const funded = await escrow.escrows(key);
if (
  getAddress(funded.buyer) !== buyer.address
  || getAddress(funded.seller) !== seller.address
  || BigInt(funded.amount) !== amount
  || Number(funded.state) !== 1
) {
  throw new Error("The funded V2 escrow state does not match the test");
}

const refundTx = await escrow
  .connect(seller)
  .refund(dealReference, buyer.address);
await refundTx.wait();

const [settled, buyerTokenAfter, contractTokenAfter, remainingAllowance] =
  await Promise.all([
    escrow.escrows(key),
    token.balanceOf(buyer.address),
    token.balanceOf(getAddress(escrowAddress)),
    token.allowance(buyer.address, getAddress(escrowAddress)),
  ]);
if (Number(settled.state) !== 2) {
  throw new Error("V2 escrow did not reach Settled state");
}
if (buyerTokenAfter !== buyerTokenBefore) {
  throw new Error("The buyer's USDT balance was not restored");
}
if (contractTokenAfter !== contractTokenBefore) {
  throw new Error("The contract retained USDT after the refund");
}
if (remainingAllowance !== 0n) {
  throw new Error("The exact USDT allowance was not fully consumed");
}

let gasReturnTx = "not-returned";
const sellerPol = await provider.getBalance(seller.address);
const feeData = await provider.getFeeData();
const maxGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
if (!maxGasPrice) {
  throw new Error(
    `Could not price the gas return; recover with ${recoveryKeyPath}`,
  );
}
const returnGasLimit = 21_000n;
const reservedGas = returnGasLimit * maxGasPrice;
if (sellerPol > reservedGas) {
  const returnTx = await seller.sendTransaction({
    to: buyer.address,
    value: sellerPol - reservedGas,
    gasLimit: returnGasLimit,
  });
  await returnTx.wait();
  gasReturnTx = returnTx.hash;
}

console.log(`contract=${getAddress(escrowAddress)}`);
console.log(`escrowKey=${key}`);
console.log(`buyer=${buyer.address}`);
console.log(`buyerBalanceBefore=${formatUnits(buyerTokenBefore, decimals)} ${symbol}`);
console.log(`buyerBalanceAfter=${formatUnits(buyerTokenAfter, decimals)} ${symbol}`);
console.log(`gasTopUp=${formatEther(gasTopUp)} POL`);
console.log(`gasTopUpTx=${topUpTx.hash}`);
console.log(`approvalTx=${approveTx.hash}`);
console.log(`fundTx=${fundTx.hash}`);
console.log(`refundTx=${refundTx.hash}`);
console.log(`gasReturnTx=${gasReturnTx}`);
console.log("roundTrip=true");

rmSync(recoveryKeyPath);
await provider.destroy();
