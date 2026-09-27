import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/server/auth";

export async function GET() {
  const configured = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  const session = getSession((await cookies()).get(SESSION_COOKIE)?.value);
  return NextResponse.json({ configured, user: session ? { name: session.name, username: session.username } : null });
}
