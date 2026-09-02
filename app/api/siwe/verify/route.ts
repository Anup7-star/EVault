import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { consumeNonce, addAuditLog } from "@/lib/store";

// POST /api/siwe/verify  { address, message, signature }
// Verifies wallet ownership: the signature must match the message, and the
// message must contain the nonce we issued (and haven't already consumed).
export async function POST(req: NextRequest) {
  const { address, message, signature } = await req.json();
  if (!address || !message || !signature) {
    return NextResponse.json({ error: "address, message, signature required" }, { status: 400 });
  }

  const expectedNonce = consumeNonce(address);
  if (!expectedNonce || !message.includes(expectedNonce)) {
    return NextResponse.json({ error: "Invalid or expired nonce" }, { status: 401 });
  }

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature,
  });

  if (!valid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  addAuditLog(address, "SIWE_VERIFIED", "Wallet ownership verified");
  return NextResponse.json({ verified: true });
}
