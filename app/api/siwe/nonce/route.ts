import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { setNonce } from "@/lib/store";

// GET /api/siwe/nonce?address=0x...
// Issues a one-time nonce the wallet must sign, preventing replay of an old signature.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address query param required" }, { status: 400 });
  }
  const nonce = crypto.randomBytes(16).toString("hex");
  setNonce(address, nonce);
  return NextResponse.json({ nonce });
}
