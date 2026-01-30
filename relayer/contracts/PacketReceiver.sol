// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PacketReceiver {
    event PacketReceived(uint256 indexed srcChainId, uint256 indexed srcSeq, address indexed sender, bytes payload);

    mapping(uint256 => mapping(uint256 => bool)) public received;

    // MVP placeholder: hub attestor EOA
    address public hubAttestor;

    constructor(address _hubAttestor) {
        hubAttestor = _hubAttestor;
    }

    struct Packet {
        uint256 srcChainId;
        uint256 dstChainId;
        uint256 srcSeq;
        address sender;
        address receiver;
        bytes payload;
        bytes32 commitment;
        uint256 hubSeq;
    }

    function recvPacket(Packet calldata p, bytes calldata hubAttestation) external {
        require(!received[p.srcChainId][p.srcSeq], "replay");
        require(_verifyHubSig(p, hubAttestation), "bad hub attestation");
        received[p.srcChainId][p.srcSeq] = true;
        emit PacketReceived(p.srcChainId, p.srcSeq, p.sender, p.payload);
    }

    function _verifyHubSig(Packet calldata p, bytes calldata sig) internal view returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(p.srcChainId, p.dstChainId, p.srcSeq, p.sender, p.receiver, p.payload, p.commitment, p.hubSeq))
        ));
        (bytes32 r, bytes32 s, uint8 v) = _split(sig);
        address recovered = ecrecover(digest, v, r, s);
        return recovered == hubAttestor;
    }

    function _split(bytes calldata sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "siglen");
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
    }
}
