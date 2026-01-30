import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

/**
 * Retourne une liste d'accounts valide pour Hardhat.
 * - si la clé est absente ou invalide → []
 * - si valide (0x + 64 hex) → [pk]
 */
function accountsFromEnv(envName: string): string[] {
  const pk = process.env[envName]?.trim();
  if (!pk) return [];
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) return [];
  return [pk];
}

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    chaina: {
      url: process.env.CHAINA_RPC || "http://127.0.0.1:8545",
      accounts: accountsFromEnv("DEPLOYER_PRIVATE_KEY"),
    },
    chainb: {
      url: process.env.CHAINB_RPC || "http://127.0.0.1:9545",
      accounts: accountsFromEnv("DEPLOYER_PRIVATE_KEY"),
    },
  },
};

export default config;
