// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PacketSender {
    event PacketSent(
        uint256 indexed dstChainId,
        uint256 indexed seq,
        address indexed sender,
        address receiver,
        bytes payload,
        bytes32 commitment
    );

    uint256 public seq;
    uint256 public immutable srcChainId;

    constructor(uint256 _srcChainId) {
        srcChainId = _srcChainId;
    }

    function sendPacket(uint256 dstChainId, address receiver, bytes calldata payload) external returns (bytes32) {
        seq += 1;
        bytes32 commitment = keccak256(abi.encode(srcChainId, dstChainId, seq, msg.sender, receiver, payload));
        emit PacketSent(dstChainId, seq, msg.sender, receiver, payload, commitment);
        return commitment;
    }
}
