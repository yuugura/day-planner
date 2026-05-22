import { NextResponse } from "next/server";
import { AuthError, createPasswordResetToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const reset = await createPasswordResetToken(body.email ?? "");
    const resetUrl = reset ? buildResetUrl(request, reset.token) : null;
    const emailSent = reset && resetUrl ? await sendPasswordResetEmail(reset.email, resetUrl) : false;
    const showDevelopmentLink = process.env.NODE_ENV !== "production" && resetUrl;

    return NextResponse.json({
      ok: true,
      emailSent,
      resetUrl: showDevelopmentLink ? resetUrl : undefined,
      message: emailSent
        ? "If an account exists for that email, a reset link has been sent."
        : "If an account exists for that email, a reset link will be available shortly."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.message : "Could not start password reset." },
      { status: 400 }
    );
  }
}

function buildResetUrl(request: Request, token: string) {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("resetToken", token);
  return url.toString();
}

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESET_EMAIL_FROM;
  if (!apiKey || !from) {
    console.info("Password reset link", { email, resetUrl });
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reset your What Now password",
      html: `<p>Use this link to reset your What Now password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 30 minutes.</p>`,
      text: `Use this link to reset your What Now password: ${resetUrl}\n\nThis link expires in 30 minutes.`
    })
  });

  if (!response.ok) {
    console.error("Could not send password reset email.", await response.text().catch(() => ""));
    return false;
  }

  return true;
}
