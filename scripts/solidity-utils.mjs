import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function resolveImport(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, "node_modules", importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `Import not found: ${importPath}` };
}

export function compileContracts() {
  const input = {
    language: "Solidity",
    sources: {
      "contracts/XcrowHubEscrow.sol": {
        content: readSource("contracts/XcrowHubEscrow.sol"),
      },
      "contracts/XcrowHubEscrowV2.sol": {
        content: readSource("contracts/XcrowHubEscrowV2.sol"),
      },
      "contracts/test/MockUSDT.sol": {
        content: readSource("contracts/test/MockUSDT.sol"),
      },
    },
    settings: {
      optimizer: { enabled: true, runs: 500 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: resolveImport }),
  );
  const errors = output.errors ?? [];
  const failures = errors.filter((entry) => entry.severity === "error");
  if (failures.length) {
    throw new Error(failures.map((entry) => entry.formattedMessage).join("\n"));
  }
  for (const warning of errors.filter((entry) => entry.severity !== "error")) {
    console.warn(warning.formattedMessage);
  }
  return output.contracts;
}

export function artifact(contracts, source, name) {
  const contract = contracts[source]?.[name];
  if (!contract) throw new Error(`Missing compiled contract ${source}:${name}`);
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
  };
}
