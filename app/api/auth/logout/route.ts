import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { endSession, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const jar = await cookies();
  endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
