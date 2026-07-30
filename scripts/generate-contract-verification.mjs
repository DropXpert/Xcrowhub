import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { AbiCoder, JsonRpcProvider, getAddress } from "ethers";

const root = process.cwd();
const contractSource = "contracts/XcrowHubEscrow.sol";
const contractName = "XcrowHubEscrow";
const contractAddress = "0x031879875E802de714D59cdC318d08Db91371F7b";
const deploymentTx =
  "0x88a18194b451b99e207b0b58b12ad0091906dee6170031dca7c874a60ef5d2e3";

function parseEnv(file) {
  const values = {};
  for (const sourceLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function sourcePath(sourceName) {
  return sourceName.startsWith("@")
    ? path.join(root, "node_modules", sourceName)
    : path.join(root, sourceName);
}

function normalizeImport(importer, imported) {
  if (!imported.startsWith(".")) return imported;
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), imported),
  );
}

function collectSources(entry) {
  const sources = {};
  const pending = [entry];
  const importPattern =
    /import\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']\s*;/g;

  while (pending.length) {
    const sourceName = pending.pop();
    if (!sourceName || sources[sourceName]) continue;
    const content = fs.readFileSync(sourcePath(sourceName), "utf8");
    sources[sourceName] = { content };

    for (const match of content.matchAll(importPattern)) {
      pending.push(normalizeImport(sourceName, match[1]));
    }
  }
  return sources;
}

const env = parseEnv(path.join(root, ".env.local"));
const token = getAddress(env.VITE_USDT_CONTRACT_ADDR);
const arbitrator = getAddress(env.EVM_ARBITRATOR_ADDRESS);
const treasury = getAddress(env.ESCROW_TREASURY_ADDRESS);

const input = {
  language: "Solidity",
  sources: collectSources(contractSource),
  settings: {
    optimizer: { enabled: true, runs: 500 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const failures = (output.errors ?? []).filter(
  (entry) => entry.severity === "error",
);
if (failures.length) {
  throw new Error(failures.map((entry) => entry.formattedMessage).join("\n"));
}

const compiled = output.contracts[contractSource]?.[contractName];
if (!compiled) throw new Error("Verification compiler output is missing");

const constructorArgs = AbiCoder.defaultAbiCoder()
  .encode(
    ["address", "address", "address"],
    [token, arbitrator, treasury],
  )
  .slice(2);

const provider = new JsonRpcProvider(env.POLYGON_RPC_URL, 137, {
  staticNetwork: true,
});
const [transaction, receipt] = await Promise.all([
  provider.getTransaction(deploymentTx),
  provider.getTransactionReceipt(deploymentTx),
]);
await provider.destroy();
if (!transaction) throw new Error("Deployment transaction was not found");
if (!receipt?.contractAddress) {
  throw new Error("Deployment receipt is missing its contract address");
}

const expectedInput =
  `0x${compiled.evm.bytecode.object}${constructorArgs}`.toLowerCase();
if (transaction.data.toLowerCase() !== expectedInput) {
  throw new Error("Compiled verification input does not match the deployment");
}
if (getAddress(receipt.contractAddress) !== getAddress(contractAddress)) {
  throw new Error("Deployment transaction created a different contract");
}

const outputDirectory = path.join(root, "output", "verification");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(
    outputDirectory,
    "XcrowHubEscrow-polygon-standard-input.json",
  ),
  `${JSON.stringify(input, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "XcrowHubEscrow-constructor-arguments.txt"),
  `${constructorArgs}\n`,
);

console.log(`compiler=${solc.version()}`);
console.log(`contract=${contractSource}:${contractName}`);
console.log(`sources=${Object.keys(input.sources).length}`);
console.log("deployment_input_match=true");
