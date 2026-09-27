import { NextResponse } from "next/server";
import { classifyComponent, describeJevError } from "@/lib/server/jev";

export async function POST(request: Request) {
  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim().slice(0, 80);
  if (!trimmed) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await classifyComponent(trimmed));
  } catch (error) {
    console.error(error);
    const { message, status } = describeJevError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
