import "@nomicfoundation/hardhat-ethers";
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    chaina: { url: process.env.CHAINA_RPC || "http://127.0.0.1:8545", accounts: [process.env.DEPLOYER_PRIVATE_KEY || ""] },
    chainb: { url: process.env.CHAINB_RPC || "http://127.0.0.1:9545", accounts: [process.env.DEPLOYER_PRIVATE_KEY || ""] }
  }
};

export default config;
