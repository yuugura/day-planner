import { NextResponse } from "next/server";
import { AuthError, buildAuthCookie, resetPasswordWithToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
    const { user, token } = await resetPasswordWithToken(body.token ?? "", body.password ?? "");

    return NextResponse.json(
      { user },
      {
        headers: { "Set-Cookie": buildAuthCookie(token) }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.message : "Could not reset password." },
      { status: 400 }
    );
  }
}
