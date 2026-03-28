import { NextRequest, NextResponse } from "next/server";
import { sessionLog } from "../_store";

export async function POST(req: NextRequest) {
  try {
    const { tier, description, timestamp } = await req.json();
    sessionLog.push({
      tier: Number(tier),
      description: String(description),
      timestamp: String(timestamp),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(sessionLog);
}
