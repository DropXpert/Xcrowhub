import { defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    cache: "./tmp/hardhat-cache",
    artifacts: "./tmp/hardhat-artifacts",
  },
});
