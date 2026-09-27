import { NextResponse } from "next/server";
import { listSubscriptions } from "@/lib/server/azure";
import { azureError, requestCredential } from "../errors";

export async function GET() {
  try {
    return NextResponse.json(await listSubscriptions(await requestCredential()));
  } catch (error) {
    return azureError(error);
  }
}
