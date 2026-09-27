"use client";

import { createContext, useContext } from "react";
import type { Simulation } from "@/lib/simulate";

export const SimulationContext = createContext<Simulation | null>(null);

export function useSimulation(): Simulation {
  const simulation = useContext(SimulationContext);
  if (!simulation) throw new Error("useSimulation must be used inside SimulationContext");
  return simulation;
}
