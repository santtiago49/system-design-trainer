import { NextResponse } from "next/server";
import { SCENARIOS_BY_ID } from "@/lib/scenarios";
import { describeJevError, evaluateDesign } from "@/lib/server/jev";
import type { EvaluationInput } from "@/lib/evaluation";

export async function POST(request: Request) {
  const input = (await request.json()) as EvaluationInput;
  const scenario = SCENARIOS_BY_ID[input.scenarioId];
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 400 });
  }
  if (input.components.length === 0) {
    return NextResponse.json({ error: "Add some components first" }, { status: 400 });
  }

  try {
    return NextResponse.json(await evaluateDesign(input, scenario));
  } catch (error) {
    console.error(error);
    const { message, status } = describeJevError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
