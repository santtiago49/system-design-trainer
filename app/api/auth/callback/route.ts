import { NextResponse } from "next/server";
import { completeLogin, SESSION_COOKIE } from "@/lib/server/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const failure = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (failure || !code || !state) {
    return NextResponse.redirect(new URL(`/?signin_error=${encodeURIComponent(failure ?? "Sign-in was cancelled.")}`, url));
  }
  try {
    const { sessionId, returnTo } = await completeLogin(code, state);
    const response = NextResponse.redirect(new URL(returnTo, url));
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return NextResponse.redirect(new URL(`/?signin_error=${encodeURIComponent(message)}`, url));
  }
}
