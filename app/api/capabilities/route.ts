import { NextResponse } from "next/server";

export async function GET() {
  const persistence = Boolean(process.env.DATABASE_URL?.trim());
  const passwordResetEmail = Boolean(
    persistence && process.env.RESEND_API_KEY?.trim() && process.env.RESET_EMAIL_FROM?.trim()
  );

  return NextResponse.json({
    persistence,
    auth: persistence,
    passwordResetEmail
  });
}
