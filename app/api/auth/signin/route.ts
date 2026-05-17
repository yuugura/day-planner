import { NextResponse } from "next/server";
import { AuthError, buildAuthCookie, verifyUserSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const { user, token } = await verifyUserSession(body.email ?? "", body.password ?? "");
    return NextResponse.json(
      { user },
      {
        headers: { "Set-Cookie": buildAuthCookie(token) }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.message : "Could not sign in." },
      { status: 400 }
    );
  }
}
