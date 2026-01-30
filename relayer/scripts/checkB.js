import { ethers } from "ethers";
import fs from "fs";

const CHAINB_RPC = process.env.CHAINB_RPC || "http://127.0.0.1:9545";
const ADDR_FILE = "/app/state/addresses.json";

function loadAddrs() {
  return JSON.parse(fs.readFileSync(ADDR_FILE, "utf8"));
}

async function main() {
  const addrs = loadAddrs();
  const providerB = new ethers.JsonRpcProvider(CHAINB_RPC);

  const receiverAbi = [
    "event PacketReceived(uint256 indexed srcChainId, uint256 indexed srcSeq, address indexed sender, bytes payload)"
  ];
  const receiver = new ethers.Contract(addrs.chainb.PacketReceiver, receiverAbi, providerB);

  const latest = await providerB.getBlockNumber();
  const logs = await receiver.queryFilter(receiver.filters.PacketReceived(), Math.max(0, latest - 2000), latest);

  console.log("received:", logs.length);
  for (const l of logs) {
    const p = receiver.interface.parseLog(l);
    console.log({
      srcChainId: p.args.srcChainId.toString(),
      srcSeq: p.args.srcSeq.toString(),
      sender: p.args.sender,
      payload: ethers.toUtf8String(p.args.payload),
    });
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
