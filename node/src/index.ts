import express from "express";
import Database from "better-sqlite3";
import { z } from "zod";

const PORT = parseInt(process.env.HUB_PORT || "7000", 10);
const DB_PATH = process.env.HUB_DB || "./hub.sqlite";

const app = express();
app.use(express.json({ limit: "1mb" }));

const db = new Database(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_seq INTEGER NOT NULL,
  src_chain_id TEXT NOT NULL,
  dst_chain_id TEXT NOT NULL,
  src_seq INTEGER NOT NULL,
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  payload_hex TEXT NOT NULL,
  commitment TEXT NOT NULL,
  proof_json TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_src ON packets(src_chain_id, src_seq, dst_chain_id);
`);

let nextHubSeq = (db.prepare("SELECT COALESCE(MAX(hub_seq), 0)+1 AS n FROM packets").get() as any).n as number;

const PacketSchema = z.object({
  srcChainId: z.string(),
  dstChainId: z.string(),
  srcSeq: z.number().int().nonnegative(),
  sender: z.string(),
  receiver: z.string(),
  payloadHex: z.string().regex(/^0x[0-9a-fA-F]*$/),
  commitment: z.string(),
  proof: z.any()
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/submit", (req, res) => {
  const parsed = PacketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const p = parsed.data;
  const hubSeq = nextHubSeq++;
  const createdAt = Date.now();

  try {
    db.prepare(`
      INSERT INTO packets (hub_seq, src_chain_id, dst_chain_id, src_seq, sender, receiver, payload_hex, commitment, proof_json, delivered, created_at)
      VALUES (@hub_seq, @src_chain_id, @dst_chain_id, @src_seq, @sender, @receiver, @payload_hex, @commitment, @proof_json, 0, @created_at)
    `).run({
      hub_seq: hubSeq,
      src_chain_id: p.srcChainId,
      dst_chain_id: p.dstChainId,
      src_seq: p.srcSeq,
      sender: p.sender,
      receiver: p.receiver,
      payload_hex: p.payloadHex,
      commitment: p.commitment,
      proof_json: JSON.stringify(p.proof),
      created_at: createdAt
    });
  } catch (e: any) {
    return res.status(409).json({ error: "Already submitted", detail: String(e?.message || e) });
  }

  res.json({ ok: true, hubSeq });
});

app.get("/pending", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM packets WHERE delivered = 0 ORDER BY hub_seq ASC LIMIT 50`).all();
  const packets = rows.map((r: any) => ({
    hubSeq: r.hub_seq,
    srcChainId: r.src_chain_id,
    dstChainId: r.dst_chain_id,
    srcSeq: r.src_seq,
    sender: r.sender,
    receiver: r.receiver,
    payloadHex: r.payload_hex,
    commitment: r.commitment,
    proof: JSON.parse(r.proof_json),
  }));
  res.json({ packets });
});

app.post("/markDelivered", (req, res) => {
  const schema = z.object({ hubSeq: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const info = db.prepare("UPDATE packets SET delivered = 1 WHERE hub_seq = ?").run(parsed.data.hubSeq);
  res.json({ ok: true, changes: info.changes });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[hub] listening on 0.0.0.0:${PORT}, db=${DB_PATH}`);
});
