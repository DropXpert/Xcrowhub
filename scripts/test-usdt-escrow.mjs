import assert from "node:assert/strict";
import hre from "hardhat";
import {
  AbiCoder,
  BrowserProvider,
  ContractFactory,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} from "ethers";
import { artifact, compileContracts } from "./solidity-utils.mjs";

const connection = await hre.network.create();
const provider = new BrowserProvider(connection.provider);
const chainId = Number((await provider.getNetwork()).chainId);
const wallets = await Promise.all(
  Array.from({ length: 7 }, (_, index) => provider.getSigner(index)),
);
const [
  deployer,
  buyer,
  seller,
  arbitrator,
  treasury,
  outsider,
  executor,
] = wallets;
const buyerAddress = await buyer.getAddress();
const sellerAddress = await seller.getAddress();
const arbitratorAddress = await arbitrator.getAddress();
const treasuryAddress = await treasury.getAddress();
const outsiderAddress = await outsider.getAddress();
const executorAddress = await executor.getAddress();

const contracts = compileContracts();
const tokenArtifact = artifact(
  contracts,
  "contracts/test/MockUSDT.sol",
  "MockUSDT",
);
const escrowArtifact = artifact(
  contracts,
  "contracts/XcrowHubEscrowV2.sol",
  "XcrowHubEscrowV2",
);

const token = await new ContractFactory(
  tokenArtifact.abi,
  tokenArtifact.bytecode,
  deployer,
).deploy();
await token.waitForDeployment();

const escrow = await new ContractFactory(
  escrowArtifact.abi,
  escrowArtifact.bytecode,
  deployer,
).deploy(
  await token.getAddress(),
  arbitratorAddress,
  treasuryAddress,
);
await escrow.waitForDeployment();

const amount = parseUnits("100", 6);
const fee = parseUnits("1", 6);
const abiCoder = AbiCoder.defaultAbiCoder();
const testTx = { gasLimit: 3_000_000 };

function dealReference(label) {
  return keccak256(toUtf8Bytes(label));
}

function boundEscrowKey(reference, address) {
  return keccak256(
    abiCoder.encode(["bytes32", "address"], [reference, address]),
  );
}

async function approveAndFund(
  label,
  fundingBuyer = buyer,
  targetSeller = sellerAddress,
  feeBps = 100,
) {
  const reference = dealReference(label);
  const fundingBuyerAddress = await fundingBuyer.getAddress();
  await (await token.mint(fundingBuyerAddress, amount, testTx)).wait();
  await (
    await token
      .connect(fundingBuyer)
      .approve(await escrow.getAddress(), amount, testTx)
  ).wait();
  await (
    await escrow
      .connect(fundingBuyer)
      .fund(reference, targetSeller, amount, feeBps, testTx)
  ).wait();
  return {
    reference,
    key: boundEscrowKey(reference, fundingBuyerAddress),
  };
}

// A copied deal reference funded by another account gets a different mapping
// key, so it cannot reserve or block the legitimate buyer's escrow.
const copiedReference = dealReference("copied-mempool-reference");
await (await token.mint(outsiderAddress, amount, testTx)).wait();
await (
  await token
    .connect(outsider)
    .approve(await escrow.getAddress(), amount, testTx)
).wait();
await (
  await escrow
    .connect(outsider)
    .fund(copiedReference, executorAddress, amount, 100, testTx)
).wait();
await (await token.mint(buyerAddress, amount, testTx)).wait();
await (
  await token
    .connect(buyer)
    .approve(await escrow.getAddress(), amount, testTx)
).wait();
await (
  await escrow
    .connect(buyer)
    .fund(copiedReference, sellerAddress, amount, 100, testTx)
).wait();

const attackerKey = boundEscrowKey(copiedReference, outsiderAddress);
const legitimateKey = boundEscrowKey(copiedReference, buyerAddress);
assert.notEqual(attackerKey, legitimateKey);
assert.equal((await escrow.escrows(attackerKey)).buyer, outsiderAddress);
assert.equal((await escrow.escrows(legitimateKey)).buyer, buyerAddress);
await (
  await escrow
    .connect(executor)
    .refund(copiedReference, outsiderAddress, testTx)
).wait();
await (
  await escrow.connect(seller).refund(copiedReference, buyerAddress, testTx)
).wait();

// The same buyer cannot fund the same reference twice.
const duplicateDeal = await approveAndFund("duplicate-reference");
await (await token.mint(buyerAddress, amount, testTx)).wait();
await (
  await token
    .connect(buyer)
    .approve(await escrow.getAddress(), amount, testTx)
).wait();
await assert.rejects(
  escrow
    .connect(buyer)
    .fund(duplicateDeal.reference, sellerAddress, amount, 100, testTx),
  /revert|AlreadyFunded/i,
);
await (
  await escrow
    .connect(seller)
    .refund(duplicateDeal.reference, buyerAddress, testTx)
).wait();

const releasedDeal = await approveAndFund("release");
await assert.rejects(
  escrow.connect(outsider).release(releasedDeal.reference, testTx),
  /revert|DealNotFunded/i,
);
await (
  await escrow.connect(buyer).release(releasedDeal.reference, testTx)
).wait();
assert.equal(await token.balanceOf(sellerAddress), amount - fee);
assert.equal(await token.balanceOf(treasuryAddress), fee);

const refundedDeal = await approveAndFund("refund");
const buyerBeforeRefund = await token.balanceOf(buyerAddress);
await (
  await escrow
    .connect(seller)
    .refund(refundedDeal.reference, buyerAddress, testTx)
).wait();
assert.equal(
  await token.balanceOf(buyerAddress),
  buyerBeforeRefund + amount,
);

const splitDeal = await approveAndFund("split");
const buyerAmount = parseUnits("35", 6);
const sellerAmount = amount - buyerAmount;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const domain = {
  name: "XcrowHub Escrow",
  version: "2",
  chainId,
  verifyingContract: await escrow.getAddress(),
};
const types = {
  Settlement: [
    { name: "escrowKey", type: "bytes32" },
    { name: "buyerAmount", type: "uint256" },
    { name: "sellerAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
const value = {
  escrowKey: splitDeal.key,
  buyerAmount,
  sellerAmount,
  nonce: 0,
  deadline,
};
const adminSignature = await arbitrator.signTypedData(domain, types, value);
const sellerSignature = await seller.signTypedData(domain, types, value);
const buyerBeforeSplit = await token.balanceOf(buyerAddress);
const sellerBeforeSplit = await token.balanceOf(sellerAddress);

await assert.rejects(
  escrow.connect(outsider).settle(
    splitDeal.reference,
    buyerAddress,
    buyerAmount,
    sellerAmount,
    0,
    deadline,
    adminSignature,
    adminSignature,
    testTx,
  ),
  /revert|DuplicateSigner/i,
);

await (
  await escrow.connect(executor).settle(
    splitDeal.reference,
    buyerAddress,
    buyerAmount,
    sellerAmount,
    0,
    deadline,
    adminSignature,
    sellerSignature,
    testTx,
  )
).wait();
assert.equal(await token.balanceOf(buyerAddress), buyerBeforeSplit + buyerAmount);
assert.equal(await token.balanceOf(sellerAddress), sellerBeforeSplit + sellerAmount);

await assert.rejects(
  escrow.connect(executor).settle(
    splitDeal.reference,
    buyerAddress,
    buyerAmount,
    sellerAmount,
    0,
    deadline,
    adminSignature,
    sellerSignature,
    testTx,
  ),
  /revert|DealNotFunded/i,
);

assert.equal(await token.balanceOf(await escrow.getAddress()), 0n);
await connection.close();
console.log("XcrowHubEscrowV2 contract tests passed");
