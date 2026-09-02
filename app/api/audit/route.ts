import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ logs: getAuditLogs() });
}
