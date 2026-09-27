import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthNotConfiguredError, NotSignedInError, SESSION_COOKIE, userCredential } from "@/lib/server/auth";

/** The signed-in user's Azure credential for this request. Throws when nobody is signed in. */
export async function requestCredential() {
  return userCredential((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Turns auth and Azure SDK failures into a message the canvas can show. */
export function azureError(error: unknown) {
  if (error instanceof AuthNotConfiguredError) {
    return NextResponse.json({ error: error.message, code: "not-configured" }, { status: 503 });
  }
  // MSAL throws InteractionRequiredAuthError when the refresh token expired or consent changed.
  if (error instanceof NotSignedInError || (error instanceof Error && error.name === "InteractionRequiredAuthError")) {
    return NextResponse.json({ error: "Sign in with Microsoft to read your Azure subscriptions.", code: "signin" }, { status: 401 });
  }
  console.error(error);
  return NextResponse.json({ error: "Azure request failed. Check the server logs.", code: "azure" }, { status: 502 });
}
