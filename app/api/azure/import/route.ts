import { NextResponse } from "next/server";
import { importSubscription } from "@/lib/server/azure";
import { azureError } from "../errors";

export async function POST(request: Request) {
  const { subscriptionId } = (await request.json()) as { subscriptionId?: string };
  if (!subscriptionId || !/^[0-9a-f-]{36}$/i.test(subscriptionId)) {
    return NextResponse.json({ error: "A subscription id is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await importSubscription(subscriptionId));
  } catch (error) {
    return azureError(error);
  }
}
