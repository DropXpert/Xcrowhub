import fs from "node:fs";
import path from "node:path";
import { artifact, compileContracts } from "./solidity-utils.mjs";

const contracts = compileContracts();
const escrow = artifact(
  contracts,
  "contracts/XcrowHubEscrowV2.sol",
  "XcrowHubEscrowV2",
);
const output = path.join(process.cwd(), "contracts", "artifacts");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, "XcrowHubEscrowV2.json"),
  `${JSON.stringify(escrow, null, 2)}\n`,
);
console.log("Compiled XcrowHubEscrowV2");
