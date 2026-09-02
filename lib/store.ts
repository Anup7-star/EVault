import fs from "fs";
import path from "path";

// Simple JSON-file store standing in for PostgreSQL in this demo.
// Swap for a real Postgres client (e.g. `pg` or Prisma) for production use —
// the shape of what's stored (nonces, encrypted secrets, audit logs) stays the same.

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type EncryptedPayload = { ciphertext: string; iv: string; authTag: string };

type DB = {
  nonces: Record<string, string>; // address -> nonce
  secrets: Record<string, EncryptedPayload>; // vaultId -> encrypted secret
  auditLogs: { timestamp: string; actor: string; action: string; detail: string }[];
};

function readDB(): DB {
  if (!fs.existsSync(DB_FILE)) {
    const empty: DB = { nonces: {}, secrets: {}, auditLogs: [] };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(db: DB) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function setNonce(address: string, nonce: string) {
  const db = readDB();
  db.nonces[address.toLowerCase()] = nonce;
  writeDB(db);
}

export function consumeNonce(address: string): string | undefined {
  const db = readDB();
  const nonce = db.nonces[address.toLowerCase()];
  delete db.nonces[address.toLowerCase()];
  writeDB(db);
  return nonce;
}

export function setSecret(vaultId: string, payload: EncryptedPayload) {
  const db = readDB();
  db.secrets[vaultId] = payload;
  writeDB(db);
}

export function getSecret(vaultId: string): EncryptedPayload | undefined {
  const db = readDB();
  return db.secrets[vaultId];
}

export function addAuditLog(actor: string, action: string, detail: string) {
  const db = readDB();
  db.auditLogs.unshift({ timestamp: new Date().toISOString(), actor, action, detail });
  db.auditLogs = db.auditLogs.slice(0, 200);
  writeDB(db);
}

export function getAuditLogs() {
  return readDB().auditLogs;
}
