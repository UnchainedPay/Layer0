import { ethers } from "ethers";
import axios from "axios";
import { execSync } from "child_process";
import fs from "fs";

const CHAINA_RPC = process.env.CHAINA_RPC!;
const CHAINB_RPC = process.env.CHAINB_RPC!;
const HUB_URL = process.env.HUB_URL!;
const PK = process.env.DEPLOYER_PRIVATE_KEY!;

const STATE_DIR = "/app/state";
const ADDR_FILE = `${STATE_DIR}/addresses.json`;

const senderAbi = [
  "event PacketSent(uint256 indexed dstChainId, uint256 indexed seq, address indexed sender, address receiver, bytes payload, bytes32 commitment)"
];

// ✅ IMPORTANT: tuple avec des noms => on peut passer un objet en ethers v6
const receiverAbi = [
  "function recvPacket((uint256 srcChainId,uint256 dstChainId,uint256 srcSeq,address sender,address receiver,bytes payload,bytes32 commitment,uint256 hubSeq) p, bytes hubAttestation)"
];

type Addrs = {
  chaina: { chainId: number; PacketSender: string; PacketReceiver: string };
  chainb: { chainId: number; PacketSender: string; PacketReceiver: string };
};

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

async function waitRpc(url: string, name: string) {
  const provider = new ethers.JsonRpcProvider(url);
  for (;;) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      console.log(`[relayer] waiting ${name}...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function deployOn(network: "chaina" | "chainb") {
  const out = execSync(`npx hardhat run scripts/deploy.ts --network ${network}`, { stdio: "pipe" }).toString();
  const sender = /PacketSender:\s*(0x[a-fA-F0-9]{40})/.exec(out)?.[1];
  const receiver = /PacketReceiver:\s*(0x[a-fA-F0-9]{40})/.exec(out)?.[1];
  const chainId = /chainId:\s*(\d+)/.exec(out)?.[1];
  if (!sender || !receiver || !chainId) throw new Error("Deploy parse failed:\n" + out);
  return { chainId: Number(chainId), PacketSender: sender, PacketReceiver: receiver };
}

async function main() {
  ensureStateDir();

  // ✅ attendre que les 2 RPC répondent vraiment
  await waitRpc(CHAINA_RPC, "chaina");
  await waitRpc(CHAINB_RPC, "chainb");

  const addrs: Addrs = {
    chaina: deployOn("chaina"),
    chainb: deployOn("chainb")
  };
  fs.writeFileSync(ADDR_FILE, JSON.stringify(addrs, null, 2));
  console.log("[relayer] deployed:", addrs);

  const providerA = new ethers.JsonRpcProvider(CHAINA_RPC);
  const providerB = new ethers.JsonRpcProvider(CHAINB_RPC);

  const signerA = new ethers.Wallet(PK, providerA);
  const signerB = new ethers.Wallet(PK, providerB);

  const senderA = new ethers.Contract(addrs.chaina.PacketSender, senderAbi, providerA);
  const receiverB = new ethers.Contract(addrs.chainb.PacketReceiver, receiverAbi, signerB);

  console.log("[relayer] watching ChainA PacketSent...");

  senderA.on("PacketSent", async (_dstChainId, seq, sender, receiver, payload, commitment, ev) => {
    try {
      const txHash = ev.log.transactionHash;

      const receipt = await providerA.getTransactionReceipt(txHash);
      if (!receipt) throw new Error("tx receipt is null");

      const block = await providerA.getBlock(receipt.blockNumber);
      if (!block) throw new Error("block is null");

      const packet = {
        srcChainId: String(addrs.chaina.chainId),
        dstChainId: String(addrs.chainb.chainId),
        srcSeq: Number(seq),
        sender: String(sender),
        receiver: String(receiver),
        payloadHex: ethers.hexlify(payload),
        commitment: String(commitment),
        proof: {
          txHash,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          header: { number: block.number, hash: block.hash, parentHash: block.parentHash, timestamp: block.timestamp }
        }
      };

      let hubSeq: number;
      try {
        const submit = await axios.post(`${HUB_URL}/submit`, packet, { timeout: 10_000 });
        hubSeq = submit.data.hubSeq as number;
        console.log("[relayer] hubSeq:", hubSeq);
      } catch (e: any) {
        // ✅ 409 = déjà soumis / conflit => on log et on stop là
        if (e?.response?.status === 409) {
          console.log("[relayer] hub submit 409 (duplicate/conflict) – skipping");
          return;
        }
        throw e;
      }

      // hub attestation placeholder: signerA signs packet digest (EIP-191)
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256","uint256","uint256","address","address","bytes","bytes32","uint256"],
        [addrs.chaina.chainId, addrs.chainb.chainId, Number(seq), sender, receiver, payload, commitment, hubSeq]
      );
      const sig = await signerA.signMessage(ethers.getBytes(ethers.keccak256(encoded)));

      const pStruct = {
        srcChainId: addrs.chaina.chainId,
        dstChainId: addrs.chainb.chainId,
        srcSeq: Number(seq),
        sender,
        receiver,
        payload,
        commitment,
        hubSeq
      };

      const tx = await receiverB.recvPacket(pStruct, sig);
      await tx.wait();

      await axios.post(`${HUB_URL}/markDelivered`, { hubSeq }, { timeout: 10_000 });
      console.log("[relayer] delivered:", tx.hash);
    } catch (e: any) {
      console.error("[relayer] error:", e?.response?.data || e?.message || e);
    }
  });

  while (true) await new Promise((r) => setTimeout(r, 60_000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});