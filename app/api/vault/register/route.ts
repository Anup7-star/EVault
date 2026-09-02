import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { setSecret, addAuditLog } from "@/lib/store";

// POST /api/vault/register  { vaultId, secret, actor }
// Called by the admin dashboard right after `registerVault()` succeeds on-chain.
// Encrypts the vault's protected content (AES-256-GCM) and stores it at rest,
// keyed by the on-chain vaultId.
export async function POST(req: NextRequest) {
  const { vaultId, secret, actor } = await req.json();
  if (vaultId === undefined || !secret) {
    return NextResponse.json({ error: "vaultId and secret required" }, { status: 400 });
  }
  const payload = encryptSecret(secret);
  setSecret(String(vaultId), payload);
  addAuditLog(actor || "unknown", "VAULT_SECRET_STORED", `vaultId=${vaultId}`);
  return NextResponse.json({ stored: true });
}
