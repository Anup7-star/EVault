import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, verifyMessage } from "viem";
import { hardhatLocal } from "@/lib/wagmiConfig";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";
import { getSecret, consumeNonce, addAuditLog } from "@/lib/store";
import { decryptSecret } from "@/lib/crypto";

// POST /api/vault/access  { vaultId, address, message, signature }
// This is the Phase 3 handshake: verify SIWE signature -> check on-chain
// checkAccess(vaultId, wallet) -> only then decrypt and return the secret.
// Signature verification directly gates decryption, so there is no separate
// "logged in" state that could go stale.
export async function POST(req: NextRequest) {
  const { vaultId, address, message, signature } = await req.json();
  if (vaultId === undefined || !address || !message || !signature) {
    return NextResponse.json(
      { error: "vaultId, address, message, signature required" },
      { status: 400 }
    );
  }

  const expectedNonce = consumeNonce(address);
  if (!expectedNonce || !message.includes(expectedNonce)) {
    return NextResponse.json({ error: "Invalid or expired nonce" }, { status: 401 });
  }

  const sigValid = await verifyMessage({ address, message, signature });
  if (!sigValid) {
    addAuditLog(address, "ACCESS_DENIED", `vaultId=${vaultId} reason=bad_signature`);
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json(
      { error: "Contract not deployed yet — run `npm run deploy:local` first" },
      { status: 503 }
    );
  }

  const client = createPublicClient({ chain: hardhatLocal, transport: http() });
  const hasAccess = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "checkAccess",
    args: [BigInt(vaultId), address],
  })) as boolean;

  if (!hasAccess) {
    addAuditLog(address, "ACCESS_DENIED", `vaultId=${vaultId} reason=no_grant_or_expired`);
    return NextResponse.json({ error: "Access denied or expired" }, { status: 403 });
  }

  const payload = getSecret(String(vaultId));
  if (!payload) {
    return NextResponse.json({ error: "No secret stored for this vault" }, { status: 404 });
  }

  const secret = decryptSecret(payload);
  addAuditLog(address, "ACCESS_GRANTED", `vaultId=${vaultId}`);
  return NextResponse.json({ secret });
}
