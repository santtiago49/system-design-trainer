import { NextResponse } from "next/server";
import { AuthNotConfiguredError, startLogin } from "@/lib/server/auth";

export async function GET(request: Request) {
  // Only same-app paths, so the sign-in can't be used to bounce users elsewhere.
  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/integrations";
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/integrations";
  try {
    return NextResponse.redirect(await startLogin(safeReturn));
  } catch (error) {
    const message = error instanceof AuthNotConfiguredError ? error.message : "Couldn't start sign-in.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
