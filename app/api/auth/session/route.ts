import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getAuthSession(request);
  return NextResponse.json({ user: session?.user ?? null });
}
