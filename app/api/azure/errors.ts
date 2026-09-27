import { NextResponse } from "next/server";

/** Turns Azure SDK failures into a message the canvas can show. */
export function azureError(error: unknown) {
  console.error(error);
  const name = error instanceof Error ? error.name : "";
  if (name === "CredentialUnavailableError" || name === "AuthenticationError") {
    return NextResponse.json({ error: "No Azure login found. Run `az login` in a terminal, then try again." }, { status: 401 });
  }
  return NextResponse.json({ error: "Azure request failed. Check the server logs." }, { status: 502 });
}
