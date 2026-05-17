import { NextResponse } from "next/server";
import { buildClearAuthCookie, deleteSession, readAuthToken } from "@/lib/auth";

export async function POST(request: Request) {
  await deleteSession(readAuthToken(request));
  return NextResponse.json(
    { ok: true },
    {
      headers: { "Set-Cookie": buildClearAuthCookie() }
    }
  );
}
