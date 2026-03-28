import { NextRequest, NextResponse } from "next/server";
import { skillStatuses } from "../_store";

export async function POST(req: NextRequest) {
  const { area, status } = await req.json();
  skillStatuses.set(String(area), String(status));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(Object.fromEntries(skillStatuses));
}
