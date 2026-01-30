# Protocol (MVP)

## Packet (logical)
Fields:
- srcChainId, dstChainId
- srcSeq
- sender, receiver
- payload
- commitment = keccak256(abi.encode(srcChainId,dstChainId,srcSeq,sender,receiver,payload))

Chain A emits:
`PacketSent(dstChainId, seq, sender, receiver, payload, commitment)`

## Hub ordering (placeholder for BFT)
Hub stores packet in SQLite and assigns `hubSeq` incrementally.
In real Layer0: ordering would be a BFT consensus result across many nodes.

## Proof (placeholder)
Relayer attaches:
- txHash
- receipt.blockNumber / blockHash
- a minimal header snapshot

In real Layer0: you’d attach:
- merkle proof of event inclusion (receipt trie proof)
- light-client verified headers/finality (or optimistic+challenge, zk, etc.)

## Hub attestation (placeholder)
Relayer signs the packet digest with an EOA key (the “hubAttestor”).
Receiver verifies signature equals `hubAttestor`.

This is a safe placeholder to keep the end-to-end flow runnable locally.
