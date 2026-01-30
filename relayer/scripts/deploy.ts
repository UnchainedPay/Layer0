import { ethers } from "hardhat";

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address, "chainId:", chainId);

  const Sender = await ethers.getContractFactory("PacketSender");
  const sender = await Sender.deploy(chainId);
  await sender.waitForDeployment();

  const Receiver = await ethers.getContractFactory("PacketReceiver");
  // MVP: hubAttestor == deployer (relayer signs)
  const receiver = await Receiver.deploy(deployer.address);
  await receiver.waitForDeployment();

  console.log("PacketSender:", await sender.getAddress());
  console.log("PacketReceiver:", await receiver.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
