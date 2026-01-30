import { ethers } from "ethers";
import fs from "fs";

const msg = process.argv.slice(2).join(" ") || "Hello from Chain A";

const CHAINA_RPC = process.env.CHAINA_RPC || "http://127.0.0.1:8545";
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR_FILE = "/app/state/addresses.json";

function loadAddrs() {
  return JSON.parse(fs.readFileSync(ADDR_FILE, "utf8"));
}

async function main() {
  const addrs = loadAddrs();

  const providerA = new ethers.JsonRpcProvider(CHAINA_RPC);
  const walletA = new ethers.Wallet(PK, providerA);

  const senderAbi = [
    "function sendPacket(uint256 dstChainId, address receiver, bytes payload) returns (bytes32)",
    "event PacketSent(uint256 indexed dstChainId, uint256 indexed seq, address indexed sender, address receiver, bytes payload, bytes32 commitment)"
  ];

  const sender = new ethers.Contract(addrs.chaina.PacketSender, senderAbi, walletA);

  const dstChainId = addrs.chainb.chainId;
  const receiver = addrs.chainb.PacketReceiver;

  const tx = await sender.sendPacket(dstChainId, receiver, ethers.toUtf8Bytes(msg));
  const r = await tx.wait();
  console.log("sent tx:", tx.hash, "block:", r.blockNumber);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
