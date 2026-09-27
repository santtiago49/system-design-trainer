import { NextResponse } from "next/server";
import { listSubscriptions } from "@/lib/server/azure";
import { azureError } from "../errors";

export async function GET() {
  try {
    return NextResponse.json(await listSubscriptions());
  } catch (error) {
    return azureError(error);
  }
}
